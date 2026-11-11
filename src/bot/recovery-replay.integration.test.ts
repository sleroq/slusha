import { expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
    createModels,
    fauxAssistantMessage,
    fauxProvider,
    fauxToolCall,
} from '@earendil-works/pi-ai';
import { eq } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { Api } from 'grammy';
import postgres from 'postgres';
import { createAgentSessions } from '../agent';
import { createDb } from '../db/client';
import { chats, conversations, events, optOuts, updates } from '../db/schema';
import { createSettings } from '../settings';
import { createIngestion } from '../telegram/ingestion';
import { createBudgets } from './budget';
import { createAgentActions, createConversationHandler } from './conversation';
import { pendingRuns, recoverRuns, resumeRequest } from './recovery';

const databaseUrl = process.env.TEST_DATABASE_URL;

test.skipIf(!databaseUrl).each(['none', 'denied', 'approved'] as const)(
    'pending private update retries after privacy-denied recovery (second crash: %s)',
    async (secondCrash) => {
        if (!databaseUrl) throw new Error('TEST_DATABASE_URL is required');

        const schema = `recovery_replay_${crypto.randomUUID().replaceAll('-', '')}`;
        const admin = postgres(databaseUrl, { max: 1, onnotice: () => {} });
        await admin.unsafe(`CREATE SCHEMA ${schema}`);
        const url = new URL(databaseUrl);
        url.searchParams.set('options', `-c search_path=${schema}`);
        const { db, close } = createDb(url.toString());
        const dir = await mkdtemp(join(tmpdir(), 'slusha-replay-'));
        let sessions: Awaited<ReturnType<typeof createAgentSessions>> | undefined;
        let ingestion: ReturnType<typeof createIngestion> | undefined;
        try {
            await migrate(db, {
                migrationsFolder: join(import.meta.dir, '../db/migrations'),
                migrationsSchema: schema,
            });

            const key = { chatId: 42, topicId: 0 };
            const user = { id: 42, is_bot: false, first_name: 'Alice' } as const;
            const chat = { id: 42, type: 'private', first_name: 'Alice' } as const;
            const message = {
                message_id: 501,
                date: Math.floor(Date.now() / 1000),
                chat,
                from: user,
                text: 'original message',
            };
            const update = { update_id: 501, message };
            await db.insert(chats).values({ id: 42, type: 'private', info: {} });
            await db.insert(optOuts).values({ chatId: 42, userId: 44 });
            const [hidden] = await db
                .insert(events)
                .values({
                    updateId: 500,
                    ...key,
                    messageId: 500,
                    userId: 44,
                    kind: 'message',
                    payload: {},
                    occurredAt: new Date(),
                    optedOut: true,
                })
                .returning();
            const [original] = await db
                .insert(events)
                .values({
                    updateId: 501,
                    ...key,
                    messageId: 501,
                    userId: 42,
                    kind: 'message',
                    payload: message,
                    occurredAt: new Date(),
                })
                .returning();
            await db.insert(conversations).values({
                ...key,
                sessionId: 'test',
                contextEventId: hidden.id,
                pendingRunEventId: original.id,
            });
            await db.insert(updates).values({ id: 501, payload: update, status: 'pending' });

            const faux = fauxProvider({ provider: 'opencode-go', models: [{ id: 'test' }] });
            const models = createModels();
            models.setProvider(faux.provider);
            const sent: string[] = [];
            const api = new Api('123:test', {
                fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
                    const request = new Request(input, init);
                    if (!request.url.endsWith('/sendMessage'))
                        throw new Error(`Unexpected request ${request.url}`);
                    const body = await request.json();
                    sent.push(body.text);
                    return Response.json({
                        ok: true,
                        result: {
                            message_id: 1001,
                            date: message.date,
                            chat,
                            from: { id: 99, is_bot: true, first_name: 'Slusha' },
                            text: body.text,
                        },
                    });
                },
            });
            const actions = createAgentActions({
                db,
                api,
                async shell() {
                    return '';
                },
            });
            sessions = await createAgentSessions({ dataDir: dir, models, actions });
            await sessions.append(key, {
                id: hidden.id,
                generation: 0,
                text: 'secret opted out history',
            });
            await sessions.close();
            sessions = undefined;

            async function interrupt() {
                const child = Bun.spawn(
                    [
                        process.execPath,
                        join(import.meta.dir, 'pending-run-fixture.ts'),
                        dir,
                        '42',
                        '0',
                        String(original.id),
                        '501',
                    ],
                    { stdout: 'pipe', stderr: 'pipe' },
                );
                const reader = child.stdout.getReader();
                try {
                    const signal = await Promise.race([
                        reader.read(),
                        Bun.sleep(15_000).then(() => {
                            throw new Error('Timed out waiting for model');
                        }),
                    ]);
                    expect(new TextDecoder().decode(signal.value)).toContain('model-started');
                } finally {
                    child.kill('SIGKILL');
                    await child.exited;
                    reader.releaseLock();
                }
            }
            await interrupt();

            faux.setResponses([
                (context) => {
                    expect(JSON.stringify(context.messages)).not.toContain(
                        'secret opted out history',
                    );
                    return fauxAssistantMessage(
                        [
                            fauxToolCall('send_reply', {
                                targetRef: 'm501',
                                text: 'sanitized reply',
                            }),
                        ],
                        { stopReason: 'toolUse' },
                    );
                },
                fauxAssistantMessage('done'),
            ]);
            const pending = await pendingRuns(db, 15 * 60_000);
            expect(resumeRequest(pending, key)).toBeUndefined();
            const budgets = createBudgets(db, {});
            sessions = await createAgentSessions({
                dataDir: dir,
                models,
                actions,
                recoverOnStartup: (scope) => resumeRequest(pending, scope),
            });
            await recoverRuns(sessions, budgets, pending);
            expect(faux.state.callCount).toBe(0);
            expect(sent).toEqual([]);

            if (secondCrash !== 'none') {
                await sessions.redact(key, [hidden.id], 'reconcile:501');
                await sessions.close();
                sessions = undefined;
                await db.update(conversations).set({ pendingRunEventId: original.id });
                await interrupt();
                if (secondCrash === 'approved') {
                    await db.delete(optOuts).where(eq(optOuts.userId, 44));
                    await db.update(events).set({ released: true }).where(eq(events.id, hidden.id));
                }
                const retryPending = await pendingRuns(db, 15 * 60_000);
                expect(resumeRequest(retryPending, key)).toBe(
                    secondCrash === 'approved' ? '501' : undefined,
                );
                sessions = await createAgentSessions({
                    dataDir: dir,
                    models,
                    actions,
                    recoverOnStartup: (scope) => resumeRequest(retryPending, scope),
                });
                await recoverRuns(sessions, budgets, retryPending);
                if (secondCrash === 'approved') {
                    expect(faux.state.callCount).toBe(2);
                    expect(sent).toEqual(['sanitized reply']);
                    expect((await sessions.recover(key, '501'))?.settlement.status).toBe('done');
                } else {
                    expect(faux.state.callCount).toBe(0);
                    expect((await sessions.recover(key, '501'))?.settlement).toMatchObject({
                        status: 'unanswered',
                        reason: 'aborted',
                        requestId: expect.stringMatching(/^run:501:retry:/),
                    });
                }
            }

            const handlerOptions = {
                db,
                api,
                sessions,
                botId: 99,
                botUsername: 'slusha_bot',
                botToken: 'test',
                settings: createSettings(db, { models: ['test'], defaultModel: 'test' }),
                budgets,
                imageModels: new Set(['test']),
                adminIds: [42],
                async resetFiles() {},
            };
            ingestion = createIngestion({
                db,
                processUpdate: createConversationHandler(handlerOptions),
                api: {
                    async getUpdates(_options, signal) {
                        while (!signal?.aborted) await Bun.sleep(10);
                        return [];
                    },
                },
            });
            await ingestion.start();
            const deadline = Date.now() + 8000;
            while (
                (await db.select().from(updates).where(eq(updates.id, 501)))[0]?.status !== 'done'
            ) {
                if (Date.now() > deadline) throw new Error('Timed out waiting for replay');
                await Bun.sleep(10);
            }
            expect(sent).toEqual(['sanitized reply']);
            expect(faux.state.callCount).toBe(2);
            await ingestion.stop();
            ingestion = undefined;
            await sessions.close();

            sessions = await createAgentSessions({ dataDir: dir, models, actions });
            await createConversationHandler({ ...handlerOptions, sessions })(update, {
                deferReply: false,
            });
            const replay = await sessions.run(key, {
                eventId: original.id,
                generation: 0,
                requestId: '501',
                model: 'test',
                text: 'original message',
            });
            expect(replay.settlement.status).toBe('done');
            expect((await sessions.recover(key, '501'))?.settlement.status).toBe('done');
            expect(faux.state.callCount).toBe(2);
        } finally {
            await ingestion?.stop();
            await sessions?.close();
            await close();
            await admin.unsafe(`DROP SCHEMA ${schema} CASCADE`);
            await admin.end();
            await rm(dir, { recursive: true, force: true });
        }
    },
    30_000,
);
