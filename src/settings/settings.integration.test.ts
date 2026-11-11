import { test, expect } from 'bun:test';
import { sign } from '@tma.js/init-data-node/web';
import postgres from 'postgres';
import { configResponseSchema, type ConfigOperation, type ConfigScope } from '../../shared/config-contract';
import { createDb } from '../db/client';
import { createConfigHandler, createSettings } from './index';

const databaseUrl = process.env.SETTINGS_TEST_DATABASE_URL;

test.skipIf(!databaseUrl)('settings resolution and signed config requests enforce authorization', async () => {
    if (!databaseUrl) throw new Error('SETTINGS_TEST_DATABASE_URL is required');
    const sql = postgres(databaseUrl, { max: 1 });
    const schema = `settings_test_${Date.now()}`;
    await sql.unsafe(`CREATE SCHEMA ${schema}`);
    const url = new URL(databaseUrl);
    url.searchParams.set('options', `-c search_path=${schema}`);
    const { db, close } = createDb(url.toString());
    try {
        await sql.unsafe(`CREATE TABLE ${schema}.settings (scope text NOT NULL, scope_id text NOT NULL, key text NOT NULL, value jsonb NOT NULL, PRIMARY KEY (scope, scope_id, key))`);
        await sql.unsafe(`CREATE TABLE ${schema}.chats (id bigint PRIMARY KEY, type text NOT NULL, info jsonb NOT NULL)`);
        await sql.unsafe(`CREATE TABLE ${schema}.chat_members (chat_id bigint NOT NULL, user_id bigint NOT NULL, last_seen timestamptz, PRIMARY KEY (chat_id, user_id))`);
        await sql.unsafe(`INSERT INTO ${schema}.chats VALUES (-1, 'supergroup', '{"title":"Group"}'), (-2, 'group', '{"title":"Secret"}')`);
        await sql.unsafe(`INSERT INTO ${schema}.chat_members (chat_id, user_id) VALUES (-1, 42), (-2, 42)`);

        const settings = createSettings(db, { models: ['a', 'b', 'c'], defaultModel: 'a' });
        await settings.set({ scope: 'global' }, 'b');
        await settings.set({ scope: 'chat', chatId: -1 }, 'c');
        expect(await settings.resolve(-1, 42)).toMatchObject({ model: 'c', locale: 'ru', randomReplyProbability: 1 });
        await settings.set({ scope: 'user', userId: 42 }, 'a');
        expect(await settings.resolve(-1, 42)).toMatchObject({ model: 'a' });
        await settings.reset({ scope: 'user', userId: 42 });
        await settings.setOption({ scope: 'global' }, 'locale', 'en');
        await settings.setOption({ scope: 'chat', chatId: -1 }, 'locale', 'uk');
        await settings.setOption({ scope: 'user', userId: 42 }, 'locale', 'pt');
        expect((await settings.resolve(-1, 42)).locale).toBe('pt');
        await settings.resetOption({ scope: 'user', userId: 42 }, 'locale');
        expect((await settings.resolve(-1, 42)).locale).toBe('uk');
        await settings.resetOption({ scope: 'chat', chatId: -1 }, 'locale');
        expect((await settings.resolve(-1, 42)).locale).toBe('en');

        expect((await settings.resolve(-1, 42))['ai.characterNamesModel']).toBe('a');
        await settings.setOption({ scope: 'global' }, 'ai.characterNamesModel', 'b');
        await settings.setOption({ scope: 'chat', chatId: -1 }, 'ai.characterNamesModel', 'c');
        await settings.setOption({ scope: 'user', userId: 42 }, 'ai.characterNamesModel', 'a');
        expect((await settings.resolve(-1, 42))['ai.characterNamesModel']).toBe('a');
        await settings.resetOption({ scope: 'user', userId: 42 }, 'ai.characterNamesModel');
        expect((await settings.resolve(-1, 42))['ai.characterNamesModel']).toBe('c');

        let admin = false;
        const handler = createConfigHandler({ db, settings, botToken: '123:secret', adminIds: [99], api: {
            async getChatMember(chatId) {
                if (chatId === -2) return { status: 'left' };
                if (admin) return { status: 'administrator' };
                return { status: 'member' };
            },
        } });
        const auth = await sign({ user: { id: 42, first_name: 'Test' } }, '123:secret', new Date());
        function request(method: string, path: string, body?: { scope: ConfigScope; chatId: number; operations: ConfigOperation[] }) {
            return handler(new Request(`https://example.test/api/config${path}`, {
                method, headers: { authorization: `tma ${auth}` }, body: body && JSON.stringify(body),
            }));
        }
        const read = await request('GET', '?scope=group&chatId=-1');
        const payload = configResponseSchema.parse(await read.json());
        expect(payload.chats.some((chat) => chat.id === -2)).toBe(false);
        expect(payload.fields[0]).toMatchObject({ value: 'c', inheritedValue: 'b', writable: false });
        expect((await request('GET', '?scope=group&chatId=-2')).status).toBe(403);
        expect((await request('GET', '?scope=global')).status).toBe(403);
        expect((await request('PUT', '', { scope: 'group', chatId: -1, operations: [{ key: 'ai.model', value: 'a' }] })).status).toBe(403);
        expect(payload.fields[1]).toMatchObject({ key: 'ai.characterNamesModel', value: 'c', inheritedValue: 'b', writable: false });
        expect((await request('PUT', '', { scope: 'group', chatId: -1, operations: [{ key: 'ai.characterNamesModel', value: 'a' }] })).status).toBe(403);
        admin = true;
        expect((await request('PUT', '', { scope: 'group', chatId: -1, operations: [{ key: 'ai.characterNamesModel', value: 'invalid' }] })).status).toBe(400);
        expect((await request('PUT', '', { scope: 'group', chatId: -1, operations: [{ key: 'ai.characterNamesModel', reset: true }] })).status).toBe(200);
        expect((await settings.resolve(-1, 42))['ai.characterNamesModel']).toBe('b');
        expect((await request('PUT', '', { scope: 'group', chatId: -1, operations: [{ key: 'ai.model', value: 'a' }, { key: 'unknown', reset: true }] })).status).toBe(400);
        expect((await settings.resolve(-1, 42)).model).toBe('c');
        expect((await request('PUT', '', { scope: 'group', chatId: -1, operations: [{ key: 'ai.model', value: 'a' }] })).status).toBe(200);
        expect((await settings.resolve(-1, 42)).model).toBe('a');
        const expired = await sign({ user: { id: 42, first_name: 'Test' } }, '123:secret', new Date(Date.now() - 90000000));
        expect((await handler(new Request('https://example.test/api/config', { headers: { authorization: `tma ${expired}` } }))).status).toBe(401);
    } finally {
        await close();
        await sql.unsafe(`DROP SCHEMA ${schema} CASCADE`);
        await sql.end();
    }
});
