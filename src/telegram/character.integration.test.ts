import { expect, test } from 'bun:test';
import { Api } from 'grammy';
import type { CallbackQuery, InlineQuery } from 'grammy/types';
import postgres from 'postgres';
import { createCharacters } from '../characters';
import { createDb } from '../db/client';
import { createCharacterHandler } from './character';

const databaseUrl = process.env.TELEGRAM_TEST_DATABASE_URL;

test.skipIf(!databaseUrl)('inline search and callbacks use target chat authorization', async () => {
    if (!databaseUrl) throw new Error('TELEGRAM_TEST_DATABASE_URL is required');
    const sql = postgres(databaseUrl, { max: 1 });
    const schema = `character_ui_${crypto.randomUUID().replaceAll('-', '')}`;
    await sql.unsafe(`CREATE SCHEMA ${schema}`);
    const url = new URL(databaseUrl);
    url.searchParams.set('options', `-c search_path=${schema}`);
    const { db, close } = createDb(url.toString());

    const requests: { method: string; body: any }[] = [];
    const searches: URL[] = [];
    const api = new Api('123:test', {
        fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
            const request = new Request(input, init);
            const method = request.url.split('/').pop()!;
            const body = await request.json();
            requests.push({ method, body });
            if (method === 'getChatMember')
                return Response.json({
                    ok: true,
                    result: {
                        status: 'administrator',
                        user: { id: body.user_id, is_bot: false, first_name: 'Admin' },
                    },
                });
            if (method === 'sendMessage')
                return Response.json({
                    ok: true,
                    result: {
                        message_id: 1,
                        date: 0,
                        chat: { id: body.chat_id, type: 'private' },
                        text: body.text,
                    },
                });
            return Response.json({ ok: true, result: true });
        },
    });
    const characters = createCharacters({
        db,
        generateNames: async () => ['Мира'],
        fetch: async (input) => {
            if (input.hostname === 'gateway.chub.ai') {
                searches.push(input);
                return Response.json({
                    data: {
                        nodes: Array.from({ length: 20 }, (_, i) => ({
                            id: i + 1,
                            name: '<Mira>',
                            fullPath: 'author/mira',
                            description: '<script>hello</script>',
                            avatar_url: 'https://example.org/a.png',
                            topics: ['fantasy'],
                            starCount: 7,
                        })),
                    },
                });
            }
            return Response.json({ data: { name: 'Mira' } });
        },
    });

    try {
        await sql.unsafe(
            `CREATE TABLE ${schema}.settings (scope text NOT NULL, scope_id text NOT NULL, key text NOT NULL, value jsonb NOT NULL, PRIMARY KEY (scope, scope_id, key))`,
        );
        await sql.unsafe(
            `CREATE TABLE ${schema}.chats (id bigint PRIMARY KEY, type text NOT NULL, info jsonb NOT NULL, send_blocked boolean NOT NULL DEFAULT false)`,
        );
        await sql.unsafe(
            `INSERT INTO ${schema}.chats (id, type, info) VALUES (42, 'private', '{}'), (-100, 'supergroup', '{}')`,
        );
        const handler = createCharacterHandler({ db, api, characters, adminIds: [99] });
        const from = { id: 42, is_bot: false, first_name: 'Alice' };
        await handler.inline({
            id: 'q',
            from,
            query: '@42 /p 2 /nsfw elf',
            offset: '',
        } satisfies InlineQuery);
        expect(searches[0]?.searchParams.get('page')).toBe('2');
        expect(searches[0]?.searchParams.get('search')).toBe('elf');
        expect(searches[0]?.searchParams.get('excludetopics')).toBe('');
        const response = requests.at(-1)!.body;
        expect(response.results[1].input_message_content.message_text).toContain(
            '<script>hello</script>',
        );
        expect(response.results[1].input_message_content.parse_mode).toBeUndefined();
        expect(response.results[1].thumbnail_url).toBe('https://example.org/a.png');
        expect(
            response.results.at(-1).reply_markup.inline_keyboard[0][0]
                .switch_inline_query_current_chat,
        ).toContain('/p 3 /nsfw elf');

        function callback(id: string, userId: number, data: string): CallbackQuery {
            return {
                id,
                from: { ...from, id: userId },
                chat_instance: 'x',
                inline_message_id: 'inline',
                data,
            };
        }

        await handler.callback(callback('bad', 43, 'set 42 1'));
        expect(await characters.get(42)).toBeUndefined();
        expect(requests.at(-1)?.body.text).toContain('Only');
        await handler.callback(callback('set', 42, 'set 42 1'));
        expect((await characters.get(42))?.name).toBe('Mira');
        await handler.callback(callback('default', 42, 'set 42 default'));
        expect(await characters.get(42)).toBeUndefined();
        const announcement = requests.filter((request) => request.method === 'sendMessage').at(-1)!;
        expect(announcement.body.reply_markup.inline_keyboard[0][1].callback_data).toBe('set 42 1');
        await handler.callback(callback('group', 43, 'set -100 1'));
        expect((await characters.get(-100))?.name).toBe('Mira');
        expect(requests.filter((request) => request.method === 'answerCallbackQuery')).toHaveLength(
            4,
        );
    } finally {
        await close();
        await sql.unsafe(`DROP SCHEMA ${schema} CASCADE`);
        await sql.end();
    }
});
