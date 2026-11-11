import { expect, test } from 'bun:test';
import { GrammyError } from 'grammy';
import type { Update } from 'grammy/types';
import postgres from 'postgres';
import { createDb } from '../db/client';
import { createIngestion, type IngestionApi } from './ingestion';

const databaseUrl = process.env.TELEGRAM_TEST_DATABASE_URL;

function deferred() {
    let resolve!: () => void;
    const promise = new Promise<void>((done) => { resolve = done; });
    return { promise, resolve };
}

async function until(condition: () => boolean | Promise<boolean>) {
    const deadline = performance.now() + 5000;
    while (!await condition()) {
        if (performance.now() > deadline) throw new Error('Timed out waiting for ingestion');
        await Bun.sleep(10);
    }
}

function message(id: number, chat: number): Update {
    return { update_id: id, message: { message_id: id, date: 0, from: { id: 99, is_bot: false, first_name: 'Test' }, chat: { id: chat, type: 'private', first_name: 'Test' }, text: 'test' } };
}

test.skipIf(!databaseUrl)('persists before acknowledgement, recovers pending work and sequences each chat', async () => {
    if (!databaseUrl) throw new Error('TELEGRAM_TEST_DATABASE_URL is required');
    const sql = postgres(databaseUrl, { max: 1 });
    const schema = `telegram_test_${Date.now()}`;
    await sql.unsafe(`CREATE SCHEMA ${schema}`);
    const url = new URL(databaseUrl);
    url.searchParams.set('options', `-c search_path=${schema}`);
    const { db, close } = createDb(url.toString());
    const gate = deferred();
    const seen: number[] = [];
    const errors: unknown[] = [];
    let ingestion: ReturnType<typeof createIngestion> | undefined;
    try {
        await sql.unsafe(`CREATE TABLE ${schema}.updates (id bigint PRIMARY KEY, payload jsonb NOT NULL, received_at timestamptz DEFAULT now(), status text DEFAULT 'pending')`);
        const unsupported: Update = { update_id: 4, message: { message_id: 4, date: 0, from: { id: 99, is_bot: false, first_name: 'Test' }, chat: { id: 10, type: 'private', first_name: 'Test' }, document: { file_id: 'svg', file_unique_id: 'svg', mime_type: 'image/svg+xml' } } };
        const batch = [message(1, 10), message(2, 10), message(3, 20), unsupported];
        let calls = 0;
        const offsets: (number | undefined)[] = [];
        const allowedUpdates: (string[] | undefined)[] = [];
        const api: IngestionApi = {
            async getUpdates(options, signal) {
                offsets.push(options?.offset);
                allowedUpdates.push(options?.allowed_updates);
                calls++;
                if (calls === 1) return batch;
                if (calls === 2) {
                    const rows = await sql.unsafe(`SELECT id FROM ${schema}.updates ORDER BY id`);
                    expect(rows.map((row) => Number(row.id))).toEqual([1, 2, 3, 4]);
                    expect(options?.offset).toBe(5);
                    return batch; // Telegram can redeliver; none may be scheduled twice.
                }
                await new Promise<void>((resolve) => signal?.addEventListener('abort', () => resolve(), { once: true }));
                return [];
            },
        };
        ingestion = createIngestion({ db, api, onError: (error) => errors.push(error), async processUpdate(update) {
            seen.push(update.update_id);
            if (update.update_id === 1) {
                await gate.promise;
                throw new Error('transient');
            }
        } });
        await ingestion.start();
        await until(() => seen.includes(3) && calls >= 3);
        expect(seen).toEqual([1, 3]);
        gate.resolve();
        await until(() => errors.length > 0);
        await ingestion.stop();
        const beforeRestart = await sql.unsafe(`SELECT id, status FROM ${schema}.updates ORDER BY id`);
        expect(beforeRestart.map((row) => [Number(row.id), row.status])).toEqual([[1, 'pending'], [2, 'pending'], [3, 'done'], [4, 'pending']]);
        expect(offsets.slice(0, 3)).toEqual([undefined, 5, 5]);
        expect(allowedUpdates).toEqual(offsets.map(() => ['message', 'edited_message', 'message_reaction', 'callback_query', 'inline_query']));

        const recovered: number[] = [];
        const deferredReplies: boolean[] = [];
        let resumeOffset: number | undefined;
        let resumeAllowedUpdates: string[] | undefined;
        ingestion = createIngestion({ db, api: {
            async getUpdates(options, signal) {
                resumeOffset = options?.offset;
                resumeAllowedUpdates = options?.allowed_updates;
                await new Promise<void>((resolve) => signal?.addEventListener('abort', () => resolve(), { once: true }));
                return [];
            },
        }, async processUpdate(update, context) {
            recovered.push(update.update_id);
            deferredReplies.push(context.deferReply);
        } });
        await ingestion.start();
        await until(async () => {
            const rows = await sql.unsafe(`SELECT count(*)::int AS count FROM ${schema}.updates WHERE status = 'done'`);
            return rows[0].count === 4;
        });
        expect(resumeOffset).toBe(5);
        expect(resumeAllowedUpdates).toEqual(['message', 'edited_message', 'message_reaction', 'callback_query', 'inline_query']);
        expect(recovered).toEqual([1, 2, 4]);
        expect(deferredReplies).toEqual([true, false, false]);
        await ingestion.stop();
    } finally {
        gate.resolve();
        await ingestion?.stop();
        await close();
        await sql.unsafe(`DROP SCHEMA ${schema} CASCADE`);
        await sql.end();
    }
});

test.skipIf(!databaseUrl)('polling resets idle offsets and restarts from the newest received update', async () => {
    if (!databaseUrl) throw new Error('TELEGRAM_TEST_DATABASE_URL is required');
    const sql = postgres(databaseUrl, { max: 1 });
    const schema = `telegram_epoch_${Date.now()}`;
    await sql.unsafe(`CREATE SCHEMA ${schema}`);
    const url = new URL(databaseUrl);
    url.searchParams.set('options', `-c search_path=${schema}`);
    const { db, close } = createDb(url.toString());
    const realNow = Date.now;
    let ingestion: ReturnType<typeof createIngestion> | undefined;
    try {
        await sql.unsafe(`CREATE TABLE ${schema}.updates (id bigint PRIMARY KEY, payload jsonb NOT NULL, received_at timestamptz DEFAULT now(), status text DEFAULT 'pending')`);
        await sql.unsafe(`INSERT INTO ${schema}.updates (id, payload, status) VALUES (900, '{}', 'done')`);
        let calls = 0;
        const offsets: (number | undefined)[] = [];
        const seen: number[] = [];
        ingestion = createIngestion({ db, api: {
            async getUpdates(options, signal) {
                offsets.push(options?.offset);
                calls++;
                if (calls === 1) {
                    const later = realNow() + 7 * 24 * 60 * 60 * 1000;
                    Date.now = () => later;
                    return [];
                }
                if (calls === 2) return [message(100, 10)];
                await new Promise<void>((resolve) => signal?.addEventListener('abort', () => resolve(), { once: true }));
                return [];
            },
        }, async processUpdate(update) { seen.push(update.update_id); } });
        await ingestion.start();
        await until(() => calls >= 3 && seen.length === 1);
        expect(offsets.slice(0, 3)).toEqual([901, undefined, 101]);
        expect(seen).toEqual([100]);
        await ingestion.stop();
        Date.now = realNow;

        let restartOffset: number | undefined;
        let restarted = false;
        ingestion = createIngestion({ db, api: {
            async getUpdates(options, signal) {
                restartOffset = options?.offset;
                restarted = true;
                await new Promise<void>((resolve) => signal?.addEventListener('abort', () => resolve(), { once: true }));
                return [];
            },
        }, async processUpdate() {} });
        await ingestion.start();
        await until(() => restarted);
        expect(restartOffset).toBe(101);
    } finally {
        Date.now = realNow;
        await ingestion?.stop();
        await close();
        await sql.unsafe(`DROP SCHEMA ${schema} CASCADE`);
        await sql.end();
    }
});


test.skipIf(!databaseUrl)('429 retry_after delays a queued update without blocking other chats', async () => {
    if (!databaseUrl) throw new Error('TELEGRAM_TEST_DATABASE_URL is required');
    const sql = postgres(databaseUrl, { max: 1 });
    const schema = `telegram_retry_${Date.now()}`;
    await sql.unsafe(`CREATE SCHEMA ${schema}`);
    const url = new URL(databaseUrl);
    url.searchParams.set('options', `-c search_path=${schema}`);
    const { db, close } = createDb(url.toString());
    let ingestion: ReturnType<typeof createIngestion> | undefined;
    try {
        await sql.unsafe(`CREATE TABLE ${schema}.updates (id bigint PRIMARY KEY, payload jsonb NOT NULL, received_at timestamptz DEFAULT now(), status text DEFAULT 'pending')`);
        let polled = false;
        const attempts: number[] = [];
        const seen: number[] = [];
        ingestion = createIngestion({ db, api: {
            async getUpdates(_options, signal) {
                if (!polled) { polled = true; return [message(1, 10), message(2, 10), message(3, 20)]; }
                await new Promise<void>((resolve) => signal?.addEventListener('abort', () => resolve(), { once: true }));
                return [];
            },
        }, async processUpdate(update) {
            if (update.update_id === 1) {
                attempts.push(performance.now());
                if (attempts.length === 1) throw new GrammyError('rate limited', { ok: false, error_code: 429, description: 'Too Many Requests', parameters: { retry_after: 1 } }, 'sendMessage', {});
            }
            seen.push(update.update_id);
        } });
        await ingestion.start();
        await until(() => seen.includes(3));
        expect(seen).not.toContain(2);
        await until(() => seen.includes(2));
        expect(attempts[1]! - attempts[0]!).toBeGreaterThanOrEqual(990);
        expect(seen).toEqual([3, 1, 2]);
    } finally {
        await ingestion?.stop();
        await close();
        await sql.unsafe(`DROP SCHEMA ${schema} CASCADE`);
        await sql.end();
    }
});

test.skipIf(!databaseUrl)('polls and processes inline queries', async () => {
    if (!databaseUrl) throw new Error('TELEGRAM_TEST_DATABASE_URL is required');
    const sql = postgres(databaseUrl, { max: 1 });
    const schema = `telegram_inline_${crypto.randomUUID().replaceAll('-', '')}`;
    await sql.unsafe(`CREATE SCHEMA ${schema}`);
    const url = new URL(databaseUrl);
    url.searchParams.set('options', `-c search_path=${schema}`);
    const { db, close } = createDb(url.toString());
    let ingestion: ReturnType<typeof createIngestion> | undefined;
    try {
        await sql.unsafe(`CREATE TABLE ${schema}.updates (id bigint PRIMARY KEY, payload jsonb NOT NULL, received_at timestamptz DEFAULT now(), status text DEFAULT 'pending')`);
        let seen = false;
        let polled = false;
        ingestion = createIngestion({ db, api: { async getUpdates(options, signal) {
            expect(options?.allowed_updates).toContain('inline_query');
            if (!polled) {
                polled = true;
                return [{ update_id: 1, inline_query: { id: 'q', from: { id: 42, is_bot: false, first_name: 'Alice' }, query: '@42 elf', offset: '' } }];
            }
            await new Promise<void>((resolve) => signal?.addEventListener('abort', () => resolve(), { once: true }));
            return [];
        } }, async processUpdate(update) { seen = update.inline_query?.query === '@42 elf'; } });
        await ingestion.start();
        await until(() => seen);
    } finally {
        await ingestion?.stop();
        await close();
        await sql.unsafe(`DROP SCHEMA ${schema} CASCADE`);
        await sql.end();
    }
});
