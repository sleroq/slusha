import { expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createModels, fauxAssistantMessage, fauxProvider, fauxToolCall } from '@earendil-works/pi-ai';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import { createAgentSessions } from '../agent';
import { createDb } from '../db/client';
import { chats, conversations, events } from '../db/schema';
import { createBudgets } from './budget';
import { pendingRuns, recoverRuns, resumeRequest } from './recovery';

const databaseUrl = process.env.TEST_DATABASE_URL;

test.skipIf(!databaseUrl)('a restored older SQLite run never resumes for a different pending update', async () => {
    if (!databaseUrl) throw new Error('TEST_DATABASE_URL is required');

    const schema = `recovery_mismatch_${crypto.randomUUID().replaceAll('-', '')}`;
    const admin = postgres(databaseUrl, { max: 1, onnotice: () => {} });
    await admin.unsafe(`CREATE SCHEMA ${schema}`);
    const url = new URL(databaseUrl);
    url.searchParams.set('options', `-c search_path=${schema}`);
    const { db, close } = createDb(url.toString());
    const dir = await mkdtemp(join(tmpdir(), 'slusha-mismatch-'));
    let sessions: Awaited<ReturnType<typeof createAgentSessions>> | undefined;
    try {
        await migrate(db, { migrationsFolder: join(import.meta.dir, '../db/migrations'), migrationsSchema: schema });
        const key = { chatId: -100, topicId: 7 };
        await db.insert(chats).values({ id: key.chatId, type: 'supergroup', info: {} });
        const [old] = await db.insert(events).values({ updateId: 501, ...key, messageId: 501, userId: 42, kind: 'message', payload: {}, occurredAt: new Date() }).returning();
        const [current] = await db.insert(events).values({ updateId: 503, ...key, messageId: 503, userId: 43, kind: 'message', payload: {}, occurredAt: new Date() }).returning();
        await db.insert(conversations).values({ ...key, sessionId: 'test', contextEventId: old.id, pendingRunEventId: current.id });
        const child = Bun.spawn([process.execPath, join(import.meta.dir, 'pending-run-fixture.ts'), dir, '-100', '7', String(old.id), '501'], { stdout: 'pipe', stderr: 'pipe' });
        const reader = child.stdout.getReader();
        try {
            const first = await Promise.race([reader.read(), Bun.sleep(15_000).then(() => { throw new Error('Timed out waiting for model'); })]);
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
        faux.setResponses([fauxAssistantMessage([fauxToolCall('send_reply', { targetRef: 'm501', text: 'stale' })], { stopReason: 'toolUse' })]);
        const pending = await pendingRuns(db, 15 * 60_000);
        expect(resumeRequest(pending, key)).toBe('503');
        sessions = await createAgentSessions({ dataDir: dir, models, recoverOnStartup: (scope) => resumeRequest(pending, scope), actions: {
            async reply(_scope, input) { replies.push(input.text); }, async react() {}, async shell() { return 'done'; },
        } });
        await recoverRuns(sessions, createBudgets(db, {}), pending);
        expect(faux.state.callCount).toBe(0);
        expect(replies).toEqual([]);
        expect((await db.select().from(conversations))[0]?.pendingRunEventId).toBeNull();
    } finally {
        await sessions?.close();
        await close();
        await admin.unsafe(`DROP SCHEMA ${schema} CASCADE`);
        await admin.end();
        await rm(dir, { recursive: true, force: true });
    }
}, 30_000);
