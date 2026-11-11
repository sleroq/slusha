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
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { eq } from 'drizzle-orm';
import postgres from 'postgres';
import { createAgentSessions } from '../agent';
import { createDb } from '../db/client';
import { chats, conversations, events, optOuts, usage } from '../db/schema';
import { createBudgets } from './budget';
import { pendingRuns, recoverRuns, resumeRequest } from './recovery';

const databaseUrl = process.env.TEST_DATABASE_URL;
const cases = [
    { name: 'stale group', type: 'supergroup', age: 3_600_000, resume: false },
    { name: 'recent group', type: 'supergroup', age: 0, resume: true },
    { name: 'old private', type: 'private', age: 3_600_000, resume: true },
    {
        name: 'private with opted-out history',
        type: 'private',
        age: 0,
        resume: false,
        hidden: true,
        optedOut: true,
    },
    {
        name: 'private with unreleased history after opt-in',
        type: 'private',
        age: 0,
        resume: false,
        hidden: true,
        optedOut: false,
    },
];

for (const scenario of cases) {
    test.skipIf(!databaseUrl)(
        `recover ${scenario.name} using its triggering user and age`,
        async () => {
            if (!databaseUrl) throw new Error('TEST_DATABASE_URL is required');
            const schema = `recovery_test_${crypto.randomUUID().replaceAll('-', '')}`;
            const admin = postgres(databaseUrl, { max: 1, onnotice: () => {} });
            await admin.unsafe(`CREATE SCHEMA ${schema}`);
            const url = new URL(databaseUrl);
            url.searchParams.set('options', `-c search_path=${schema}`);
            const { db, close } = createDb(url.toString());
            const dir = await mkdtemp(join(tmpdir(), 'slusha-pending-'));
            let sessions: Awaited<ReturnType<typeof createAgentSessions>> | undefined;
            try {
                await migrate(db, {
                    migrationsFolder: join(import.meta.dir, '../db/migrations'),
                    migrationsSchema: schema,
                });
                let chatId = -100;
                if (scenario.type === 'private') chatId = 42;
                const key = { chatId, topicId: 7 };
                await db.insert(chats).values({ id: chatId, type: scenario.type, info: {} });
                const [original] = await db
                    .insert(events)
                    .values({
                        updateId: 501,
                        chatId,
                        topicId: key.topicId,
                        messageId: 501,
                        userId: 42,
                        kind: 'message',
                        payload: {},
                        occurredAt: new Date(Date.now() - scenario.age),
                    })
                    .returning();
                await db
                    .insert(conversations)
                    .values({ ...key, sessionId: 'test', pendingRunEventId: original.id });
                await db.insert(events).values({
                    updateId: 502,
                    chatId,
                    topicId: key.topicId,
                    messageId: 501,
                    userId: 43,
                    kind: 'reaction',
                    payload: {},
                    occurredAt: new Date(),
                });
                if ('hidden' in scenario && scenario.hidden) {
                    if (scenario.optedOut) await db.insert(optOuts).values({ chatId, userId: 44 });
                    await db.insert(events).values({
                        updateId: 504,
                        chatId,
                        topicId: key.topicId,
                        messageId: 504,
                        userId: 44,
                        kind: 'message',
                        payload: {},
                        occurredAt: new Date(),
                        optedOut: true,
                    });
                }

                const child = Bun.spawn(
                    [
                        process.execPath,
                        join(import.meta.dir, 'pending-run-fixture.ts'),
                        dir,
                        String(chatId),
                        '7',
                        String(original.id),
                        '501',
                    ],
                    { stdout: 'pipe', stderr: 'pipe' },
                );
                const reader = child.stdout.getReader();
                try {
                    const first = await Promise.race([
                        reader.read(),
                        Bun.sleep(15_000).then(() => {
                            throw new Error('Timed out waiting for model');
                        }),
                    ]);
                    expect(new TextDecoder().decode(first.value)).toContain('model-started');
                } finally {
                    child.kill('SIGKILL');
                    await child.exited;
                    reader.releaseLock();
                }

                const faux = fauxProvider({ provider: 'opencode-go', models: [{ id: 'test' }] });
                const models = createModels();
                models.setProvider(faux.provider);
                const replies: string[] = [];
                faux.setResponses([
                    fauxAssistantMessage(
                        [fauxToolCall('send_reply', { targetRef: 'm501', text: 'recovered' })],
                        { stopReason: 'toolUse' },
                    ),
                    fauxAssistantMessage('done'),
                ]);
                const budgets = createBudgets(db, {});
                const pending = await pendingRuns(db, 15 * 60_000);
                expect(pending).toHaveLength(1);
                if (scenario.resume) expect(resumeRequest(pending, key)).toBe('501');
                else expect(resumeRequest(pending, key)).toBeUndefined();
                sessions = await createAgentSessions({
                    dataDir: dir,
                    models,
                    recoverOnStartup: (scope) => resumeRequest(pending, scope),
                    actions: {
                        async reply(_scope, input) {
                            replies.push(input.text);
                        },
                        async react() {},
                        async shell() {
                            return 'done';
                        },
                    },
                });
                await recoverRuns(sessions, budgets, pending);
                if (scenario.resume) expect(replies).toEqual(['recovered']);
                else {
                    expect(replies).toEqual([]);
                    expect(faux.state.callCount).toBe(0);
                }
                const [alice] = await db.select().from(usage).where(eq(usage.accountType, 'user'));
                expect(alice.accountId).toBe(42);
                const aliceTotal = alice.inputTokens + alice.outputTokens + alice.cacheReadTokens;
                expect(aliceTotal).toBeGreaterThan(0);
                expect((await db.select().from(conversations))[0]?.pendingRunEventId).toBeNull();
                await recoverRuns(sessions, budgets, pending);
                const [sameAlice] = await db
                    .select()
                    .from(usage)
                    .where(eq(usage.accountType, 'user'));
                expect(
                    sameAlice.inputTokens + sameAlice.outputTokens + sameAlice.cacheReadTokens,
                ).toBe(aliceTotal);

                const [next] = await db
                    .insert(events)
                    .values({
                        updateId: 503,
                        chatId,
                        topicId: key.topicId,
                        messageId: 503,
                        userId: 43,
                        kind: 'message',
                        payload: {},
                        occurredAt: new Date(),
                    })
                    .returning();
                faux.setResponses([fauxAssistantMessage('new reply')]);
                await budgets.start(key, next.id);
                const result = await sessions.run(key, {
                    eventId: next.id,
                    generation: 0,
                    requestId: '503',
                    model: 'test',
                    text: 'second user',
                });
                await budgets.record(key, 43, next.id, result.cumulativeUsage);
                const rows = await db.select().from(usage);
                const bob = rows.find((row) => row.accountType === 'user' && row.accountId === 43)!;
                const chat = rows.find((row) => row.accountType === 'chat')!;
                const bobTotal = bob.inputTokens + bob.outputTokens + bob.cacheReadTokens;
                expect(bobTotal).toBeGreaterThan(0);
                expect(chat.inputTokens + chat.outputTokens + chat.cacheReadTokens).toBe(
                    aliceTotal + bobTotal,
                );
            } finally {
                await sessions?.close();
                await close();
                await admin.unsafe(`DROP SCHEMA ${schema} CASCADE`);
                await admin.end();
                await rm(dir, { recursive: true, force: true });
            }
        },
        30_000,
    );
}
