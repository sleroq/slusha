import { expect, test } from 'bun:test';
import postgres from 'postgres';
import { createDb } from '../db/client';
import { createCharacters } from './index';

const databaseUrl = process.env.CHARACTERS_TEST_DATABASE_URL;

test.skipIf(!databaseUrl)(
    'Chub search and character persistence isolate chats and reject invalid data',
    async () => {
        if (!databaseUrl) throw new Error('CHARACTERS_TEST_DATABASE_URL is required');

        const sql = postgres(databaseUrl, { max: 1 });
        const schema = `characters_test_${Date.now()}`;
        await sql.unsafe(`CREATE SCHEMA ${schema}`);
        const url = new URL(databaseUrl);
        url.searchParams.set('options', `-c search_path=${schema}`);
        const { db, close } = createDb(url.toString());
        let card = JSON.stringify({
            data: {
                name: 'Alice',
                description: 'A traveler',
                personality: ['curious', 'kind'],
                system_prompt: 'Stay in character',
            },
        });
        let search = JSON.stringify({
            data: {
                nodes: [
                    {
                        id: 12,
                        name: 'Alice',
                        fullPath: 'author/alice',
                        description: 'Hello',
                        avatar_url: 'https://example.com/a',
                        topics: ['fantasy'],
                        starCount: 3,
                        extra: true,
                    },
                ],
            },
        });
        const requests: URL[] = [];
        async function request(input: URL) {
            const target = new URL(String(input));
            requests.push(target);
            if (target.hostname === 'gateway.chub.ai') return new Response(search);
            return new Response(card);
        }
        try {
            await sql.unsafe(
                `CREATE TABLE ${schema}.settings (scope text NOT NULL, scope_id text NOT NULL, key text NOT NULL, value jsonb NOT NULL, PRIMARY KEY (scope, scope_id, key))`,
            );
            const characters = createCharacters({
                db,
                generateNames: async () => ['Мира'],
                fetch: request,
            });
            expect(await characters.search('Alice & Bob', 2)).toEqual([
                {
                    id: 12,
                    name: 'Alice',
                    path: 'author/alice',
                    description: 'Hello',
                    avatar: 'https://example.com/a',
                    topics: ['fantasy'],
                    stars: 3,
                },
            ]);
            expect(requests[0]?.searchParams.get('search')).toBe('Alice & Bob');
            expect(requests[0]?.searchParams.get('page')).toBe('2');
            expect(requests[0]?.searchParams.get('namespace')).toBe('characters');
            await characters.search('test', 3, false);
            expect(requests[1]?.searchParams.get('excludetopics')).toBe('');
            expect(requests[1]?.searchParams.get('page')).toBe('3');
            const selected = await characters.select(-1, 12, 42);
            expect(requests[2]?.pathname).toBe(
                '/api/v4/projects/12/repository/files/raw%252Ftavern_raw.json/raw',
            );
            expect(selected).toEqual({
                id: 12,
                name: 'Alice',
                description: 'A traveler',
                personality: 'curious\nkind',
                scenario: '',
                systemPrompt: 'Stay in character',
                exampleDialogue: '',
                names: ['Мира'],
            });
            expect(await characters.get(-1)).toEqual(selected);
            expect(await characters.get(-2)).toBeUndefined();
            card = JSON.stringify({
                data: { name: 'Bob', scenario: 'A scene', mes_example: 'Hello' },
            });
            await characters.select(-2, 13, 42);
            card = JSON.stringify({ data: { name: 'Too long', description: 'x'.repeat(32_001) } });
            expect(characters.select(-1, 14, 42)).rejects.toThrow();
            card = JSON.stringify({ data: { name: 'Invalid', scenario: 5 } });
            expect(characters.select(-1, 14, 42)).rejects.toThrow();
            expect(await characters.get(-1)).toEqual(selected);
            search = JSON.stringify({ data: { nodes: [{ id: 'bad', name: 'Invalid' }] } });
            expect(characters.search('bad')).rejects.toThrow();
            await characters.clear(-1);
            expect(await characters.get(-1)).toBeUndefined();
            expect((await characters.get(-2))?.name).toBe('Bob');
            await sql.unsafe(
                `UPDATE ${schema}.settings SET value = '{"id": 13}'::jsonb WHERE scope_id = '-2'`,
            );
            expect(characters.get(-2)).rejects.toThrow();
        } finally {
            await close();
            await sql.unsafe(`DROP SCHEMA ${schema} CASCADE`);
            await sql.end();
        }
    },
);

test.skipIf(!databaseUrl)(
    'selection generates names with scoped model and charges usage even on failure',
    async () => {
        if (!databaseUrl) throw new Error('CHARACTERS_TEST_DATABASE_URL is required');
        const { createModels, fauxAssistantMessage, fauxProvider } =
            await import('@earendil-works/pi-ai');
        const { createBudgets } = await import('../bot/budget');
        const { createSettings } = await import('../settings');
        const { createNameGenerator } = await import('./generation');

        const sql = postgres(databaseUrl, { max: 1 });
        const schema = `names_test_${Date.now()}`;
        await sql.unsafe(`CREATE SCHEMA ${schema}`);
        const url = new URL(databaseUrl);
        url.searchParams.set('options', `-c search_path=${schema}`);
        const { db, close } = createDb(url.toString());
        try {
            await sql.unsafe(
                `CREATE TABLE ${schema}.settings (scope text NOT NULL, scope_id text NOT NULL, key text NOT NULL, value jsonb NOT NULL, PRIMARY KEY (scope, scope_id, key))`,
            );
            await sql.unsafe(
                `CREATE TABLE ${schema}.usage (account_type text NOT NULL, account_id bigint NOT NULL, week_start date NOT NULL, input_tokens bigint NOT NULL DEFAULT 0, output_tokens bigint NOT NULL DEFAULT 0, cache_read_tokens bigint NOT NULL DEFAULT 0, PRIMARY KEY (account_type, account_id, week_start))`,
            );
            const faux = fauxProvider({
                provider: 'opencode-go',
                models: [{ id: 'a' }, { id: 'b' }],
            });
            const models = createModels();
            models.setProvider(faux.provider);
            const settings = createSettings(db, { models: ['a', 'b'], defaultModel: 'a' });
            await settings.setOption({ scope: 'user', userId: 42 }, 'ai.characterNamesModel', 'b');
            const budgets = createBudgets(db, { user: 1000 });
            const characters = createCharacters({
                db,
                generateNames: createNameGenerator({ models, settings, budgets }),
                fetch: async () => Response.json({ data: { name: 'Alice' } }),
            });

            const response = fauxAssistantMessage('{"names":["Алиса","Alice"]}');
            response.usage = { ...response.usage, input: 2, output: 3, cacheRead: 1 };
            let chosen = '';
            faux.setResponses([
                (_context, _options, _state, model) => {
                    chosen = model.id;
                    return response;
                },
            ]);
            const selected = await characters.select(-1, 12, 42);
            expect(chosen).toBe('b');
            expect(selected.names).toEqual(['Алиса', 'Alice']);

            const invalid = fauxAssistantMessage('not json');
            invalid.usage = { ...invalid.usage, input: 2, output: 3, cacheRead: 1 };
            faux.setResponses([invalid]);
            expect(characters.select(-1, 13, 42)).rejects.toThrow();
            expect(await characters.get(-1)).toEqual(selected);

            const failed = fauxAssistantMessage('', { stopReason: 'error' });
            failed.usage = { ...failed.usage, input: 2, output: 3, cacheRead: 1 };
            faux.setResponses([failed]);
            expect(characters.select(-1, 13, 42)).rejects.toThrow();
            expect(await characters.get(-1)).toEqual(selected);

            const rows = await sql.unsafe(
                `SELECT account_type, input_tokens::int, output_tokens::int, cache_read_tokens::int FROM ${schema}.usage ORDER BY account_type`,
            );
            expect(rows[0]?.input_tokens).toBeGreaterThan(0);
            expect(rows[0]?.output_tokens).toBeGreaterThan(0);
            expect(rows[1]).toMatchObject({
                account_type: 'user',
                input_tokens: rows[0]?.input_tokens,
                output_tokens: rows[0]?.output_tokens,
                cache_read_tokens: rows[0]?.cache_read_tokens,
            });

            const exhausted = createCharacters({
                db,
                generateNames: createNameGenerator({
                    models,
                    settings,
                    budgets: createBudgets(db, { user: 1 }),
                }),
                fetch: async () => Response.json({ data: { name: 'Alice' } }),
            });
            const count = faux.state.callCount;
            expect(exhausted.select(-1, 14, 42)).rejects.toThrow('Budget exhausted');
            expect(faux.state.callCount).toBe(count);
            await sql.unsafe(
                `UPDATE ${schema}.settings SET value = value - 'names' WHERE key = 'character'`,
            );
            expect((await characters.get(-1))?.names).toBeUndefined();
        } finally {
            await close();
            await sql.unsafe(`DROP SCHEMA ${schema} CASCADE`);
            await sql.end();
        }
    },
);
