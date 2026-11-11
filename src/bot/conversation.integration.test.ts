import { expect, test } from 'bun:test';
import { copyFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createModels, fauxAssistantMessage, fauxProvider, fauxToolCall, getCurrentTools } from '@earendil-works/pi-ai';
import { eq } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { Api } from 'grammy';
import type { Update } from 'grammy/types';
import postgres from 'postgres';
import { createAgentSessions } from '../agent';
import { createCharacters } from '../characters';
import { createDb } from '../db/client';
import { chats, conversations, events, updates, usage } from '../db/schema';
import { createSettings } from '../settings';
import { createIngestion } from '../telegram/ingestion';
import { createBudgets, type BudgetLimits } from './budget';
import { createAgentActions, createConversationHandler } from './conversation';

type TelegramFailures = { sendError?: { code: number; description: string }; memberError?: { code: number; description: string } };

const databaseUrl = process.env.TEST_DATABASE_URL;
const user = { id: 42, is_bot: false, first_name: 'Alice' } as const;
const privateChat = { id: 42, type: 'private', first_name: 'Alice' } as const;
const group = { id: -100, type: 'supergroup', title: 'Group' } as const;

function message(id: number, text: string, chat: NonNullable<Update['message']>['chat'] = privateChat, date = Math.floor(Date.now() / 1000)): NonNullable<Update['message']> {
    return { message_id: id, date, chat, from: user, text };
}

async function withApp(run: (app: Awaited<ReturnType<typeof appFixture>>) => Promise<void>, limits: BudgetLimits = {}) {
    const app = await appFixture(limits);
    try { await run(app); } finally { await app.close(); }
}

async function appFixture(limits: BudgetLimits, contextWindow?: number) {
    if (!databaseUrl) throw new Error('TEST_DATABASE_URL is required');

    const schema = `bot_test_${crypto.randomUUID().replaceAll('-', '')}`;
    const admin = postgres(databaseUrl, { max: 1, onnotice: () => {} });
    await admin.unsafe(`CREATE SCHEMA ${schema}`);
    const url = new URL(databaseUrl);
    url.searchParams.set('options', `-c search_path=${schema}`);
    const { db, close } = createDb(url.toString());
    const dir = await mkdtemp(join(tmpdir(), 'slusha-bot-'));
    let sessions: Awaited<ReturnType<typeof createAgentSessions>> | undefined;
    try {
        await migrate(db, { migrationsFolder: join(import.meta.dir, '../db/migrations'), migrationsSchema: schema });
        const sent: { chatId: number | string; text: string; options: object }[] = [];
        const deleted: number[] = [];
        const telegram: TelegramFailures = {};
        const api = new Api('123:test', { fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
            if (String(input).endsWith('/getFile')) return Response.json({ ok: true, result: { file_id: 'photo', file_unique_id: 'unique', file_path: 'photo.png' } });
            if (String(input).endsWith('/getChatMember')) {
                if (telegram.memberError) return Response.json({ ok: false, error_code: telegram.memberError.code, description: telegram.memberError.description });
                return Response.json({ ok: true, result: { status: 'member', user } });
            }
            if (String(input).endsWith('/deleteMessage')) {
                deleted.push(JSON.parse(String(init?.body)).message_id);
                return Response.json({ ok: true, result: true });
            }
            if (!String(input).endsWith('/sendMessage')) throw new Error(`Unexpected Telegram request: ${input}`);
            const { chat_id: chatId, text, ...options } = JSON.parse(String(init?.body));
            sent.push({ chatId, text, options });
            if (telegram.sendError) return Response.json({ ok: false, error_code: telegram.sendError.code, description: telegram.sendError.description });
            return Response.json({ ok: true, result: { message_id: 1000 + sent.length, date: Math.floor(Date.now() / 1000), chat: { id: chatId, type: 'private' }, from: { id: 99, is_bot: true, first_name: 'Slusha' }, text } });
        } });
        const faux = fauxProvider({ provider: 'opencode-go', models: [{ id: 'test', contextWindow }] });
        const models = createModels();
        models.setProvider(faux.provider);
        const actions = createAgentActions({ db, api, async shell() { return ''; } });
        sessions = await createAgentSessions({ dataDir: dir, models, actions });
        const characters = createCharacters({ db, generateNames: async () => ['Мира'], fetch: async (url) => {
            if (url.hostname === 'gateway.chub.ai') return Response.json({ data: { nodes: [{ id: 12, name: 'Mira', fullPath: 'author/mira' }] } });
            return Response.json({ data: { name: 'Mira', description: 'A curious stargazer', personality: 'gentle' } });
        } });
        const settings = createSettings(db, { models: ['test'], defaultModel: 'test' });
        const handlerOptions = {
            db, api, sessions, characters, botId: 99, botUsername: 'slusha_bot', botToken: 'test',
            settings,
            budgets: createBudgets(db, limits), imageModels: new Set(['test']), adminIds: [42], async resetFiles() {},
        };
        let processUpdate = createConversationHandler(handlerOptions);
        return {
            db, faux, sent, deleted, telegram, restart() { processUpdate = createConversationHandler(handlerOptions); }, processUpdate: (...args: Parameters<typeof processUpdate>) => processUpdate(...args), actions, settings,
            get sessions() { return sessions!; },
            async snapshot() {
                await sessions!.close();
                await copyFile(join(dir, '42_0.sqlite'), join(dir, 'snapshot'));
                sessions = await createAgentSessions({ dataDir: dir, models, actions });
                handlerOptions.sessions = sessions;
                processUpdate = createConversationHandler(handlerOptions);
            },
            async restore() {
                await sessions!.close();
                await copyFile(join(dir, 'snapshot'), join(dir, '42_0.sqlite'));
                sessions = await createAgentSessions({ dataDir: dir, models, actions });
                handlerOptions.sessions = sessions;
                processUpdate = createConversationHandler(handlerOptions);
            },
            async close() {
                await sessions?.close();
                await close();
                await admin.unsafe(`DROP SCHEMA ${schema} CASCADE`);
                await admin.end();
                await rm(dir, { recursive: true, force: true });
            },
        };
    } catch (error) {
        await sessions?.close();
        await close();
        await admin.unsafe(`DROP SCHEMA ${schema} CASCADE`);
        await admin.end();
        await rm(dir, { recursive: true, force: true });
        throw error;
    }
}

function update(id: number, text: string, chat: NonNullable<Update['message']>['chat'] = privateChat, date?: number): Update {
    return { update_id: id, message: message(id, text, chat, date) };
}

test.skipIf(!databaseUrl)('persisted message reaches the agent and send_reply uses its Telegram reference', async () => {
    await withApp(async ({ db, faux, sent, processUpdate }) => {
        let context = '';
        let persisted = false;
        faux.setResponses([
            async (input) => {
                context = JSON.stringify(input.messages);
                persisted = (await db.select().from(events).where(eq(events.updateId, 1))).length === 1;
                return fauxAssistantMessage([fauxToolCall('send_reply', { targetRef: 'm1', text: 'hello' })], { stopReason: 'toolUse' });
            },
            fauxAssistantMessage('done'),
        ]);
        await processUpdate(update(1, 'hello agent'));
        expect(persisted).toBe(true);
        expect(context).toContain('[m1] Alice: hello agent');
        expect(sent).toEqual([{ chatId: 42, text: 'hello', options: { reply_parameters: { message_id: 1 } } }]);
        const rows = await db.select().from(events);
        expect(rows.map((row) => row.kind)).toEqual(['message', 'bot_message']);
        expect(rows[1]?.messageId).toBe(1001);
    });
});

test.skipIf(!databaseUrl)('delivery rights persist across handler restart and ingestion progresses through denied and restored sends', async () => {
    await withApp(async ({ db, faux, sent, deleted, telegram, restart, processUpdate }) => {
        telegram.sendError = { code: 400, description: 'Bad Request: not enough rights to send text messages to the chat' };
        faux.setResponses([
            fauxAssistantMessage([fauxToolCall('send_reply', { targetRef: 'm1', text: 'first reply' })], { stopReason: 'toolUse' }),
            fauxAssistantMessage('done'),
        ]);

        const batches: Update[][] = [[update(1, 'slusha first', group)]];
        const ingestion = createIngestion({ db, processUpdate, api: {
            async getUpdates(_options, signal) {
                while (!batches.length && !signal?.aborted) await Bun.sleep(10);
                return batches.shift() ?? [];
            },
        } });
        async function done(id: number) {
            const deadline = Date.now() + 8000;
            while (!(await db.select().from(updates).where(eq(updates.id, id)))[0] || (await db.select().from(updates).where(eq(updates.id, id)))[0]?.status !== 'done') {
                if (Date.now() > deadline) throw new Error(`Timed out waiting for ${id}`);
                await Bun.sleep(10);
            }
        }
        try {
            await ingestion.start();
            await done(1);
            expect((await db.select().from(chats))[0]?.sendBlocked).toBe(true);
            const calls = faux.state.callCount;
            restart();
            telegram.sendError = { code: 403, description: 'Forbidden: bot was blocked by the user' };
            batches.push([{ update_id: 2, message: { ...message(2, 'slusha again', group), message_thread_id: 7 } }]);
            await done(2);
            expect(faux.state.callCount).toBe(calls);
            expect(sent.at(-1)).toEqual({ chatId: group.id, text: 'Checking rights', options: { message_thread_id: 7 } });
            telegram.sendError = undefined;
            faux.setResponses([fauxAssistantMessage('done')]);
            batches.push([{ update_id: 3, message: { ...message(3, 'slusha restored', group), message_thread_id: 7 } }]);
            await done(3);
            expect(faux.state.callCount).toBe(calls + 1);
            expect((await db.select().from(chats))[0]?.sendBlocked).toBe(false);
            expect(deleted).toHaveLength(1);
            expect((await db.select().from(events)).map((row) => row.updateId)).toEqual([1, 2, 3]);
        } finally { await ingestion.stop(); }
    });
});

test.skipIf(!databaseUrl)('authorization failures do not block subsequent chat updates or mark send rights lost', async () => {
    await withApp(async ({ db, telegram, processUpdate }) => {
        telegram.memberError = { code: 400, description: 'Bad Request: chat not found' };
        const other = { id: 43, is_bot: false, first_name: 'Bob' } as const;
        await processUpdate({ update_id: 1, message: { ...message(1, '/language en', group), from: other } });
        await processUpdate(update(2, '/budget', group));
        expect((await db.select().from(events)).map((row) => row.updateId)).toEqual([1, 2]);
        expect((await db.select().from(chats))[0]?.sendBlocked).toBe(false);
    });
});

test.skipIf(!databaseUrl)('transient command send failures remain retryable after the event is persisted', async () => {
    await withApp(async ({ db, telegram, processUpdate }) => {
        telegram.sendError = { code: 429, description: 'Too Many Requests' };
        await expect(processUpdate(update(1, '/budget'))).rejects.toThrow('Too Many Requests');
        expect(await db.select().from(events).where(eq(events.updateId, 1))).toHaveLength(1);
        expect((await db.select().from(chats))[0]?.sendBlocked).toBe(false);
        telegram.sendError = undefined;
        await processUpdate(update(1, '/budget'));
        expect(await db.select().from(events).where(eq(events.updateId, 1))).toHaveLength(1);
    });
});

test.skipIf(!databaseUrl)('Telegram image documents reach the selected image-capable model', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = Object.assign(async () => new Response(new Uint8Array([1, 2, 3])), { preconnect: originalFetch.preconnect });
    try {
        await withApp(async ({ faux, processUpdate }) => {
            let context = '';
            faux.setResponses([(input) => { context = JSON.stringify(input.messages); return fauxAssistantMessage('done'); }]);
            await processUpdate({ update_id: 1, message: {
                message_id: 1, date: Math.floor(Date.now() / 1000), chat: privateChat, from: user,
                document: { file_id: 'photo', file_unique_id: 'unique', mime_type: 'image/png' },
            } });
            expect(context).toContain('AQID');
            expect(context).toContain('image/png');
        });
    } finally {
        globalThis.fetch = originalFetch;
    }
});

test.skipIf(!databaseUrl)('queued private messages produce one reply with the entire batch', async () => {
    await withApp(async ({ db, faux, sent, processUpdate }) => {
        let context = '';
        faux.setResponses([
            (input) => {
                context = JSON.stringify(input.messages);
                return fauxAssistantMessage([fauxToolCall('send_reply', { targetRef: 'm2', text: 'both received' })], { stopReason: 'toolUse' });
            },
            fauxAssistantMessage('done'),
        ]);
        let polled = false;
        const ingestion = createIngestion({ db, processUpdate, api: {
            async getUpdates(_options, signal) {
                if (!polled) {
                    polled = true;
                    return [update(1, 'first message'), update(2, 'second message')];
                }
                await new Promise<void>((resolve) => signal?.addEventListener('abort', () => resolve(), { once: true }));
                return [];
            },
        } });
        try {
            await ingestion.start();
            const deadline = Date.now() + 5000;
            while ((await db.select().from(updates).where(eq(updates.status, 'done'))).length !== 2) {
                if (Date.now() > deadline) throw new Error('Timed out waiting for the batch');
                await Bun.sleep(10);
            }
            expect(context).toContain('first message');
            expect(context).toContain('second message');
            expect(faux.state.callCount).toBe(2);
            expect(sent.map((reply) => reply.text)).toEqual(['both received']);
        } finally {
            await ingestion.stop();
        }
    });
});

test.skipIf(!databaseUrl)('opted-out events remain stored but never enter context after opt-in', async () => {
    await withApp(async ({ db, faux, processUpdate }) => {
        await processUpdate(update(1, '/optout'));
        await processUpdate(update(2, 'private opted-out text'));
        await processUpdate(update(3, '/optin'));
        let context = '';
        faux.setResponses([(input) => { context = JSON.stringify(input.messages); return fauxAssistantMessage('done'); }]);
        await processUpdate(update(4, 'after opt-in'));
        expect(faux.state.callCount).toBe(1);
        expect(context).toContain('after opt-in');
        expect(context).not.toContain('private opted-out text');
        const [excluded] = await db.select().from(events).where(eq(events.updateId, 2));
        expect(excluded?.optedOut).toBe(true);
        expect(JSON.stringify(excluded?.payload)).toContain('private opted-out text');
    });
});

test.skipIf(!databaseUrl)('/forget resets agent context without deleting persisted events', async () => {
    await withApp(async ({ db, faux, processUpdate, sessions }) => {
        faux.setResponses([fauxAssistantMessage('done')]);
        await processUpdate(update(1, 'before reset marker'));
        await processUpdate(update(2, '/forget'));
        const [reset] = await db.select().from(conversations);
        expect(await sessions.checkpoint({ chatId: 42, topicId: 0 })).toEqual({ generation: reset!.generation, eventId: reset!.contextEventId });
        let context = '';
        faux.setResponses([(input) => { context = JSON.stringify(input.messages); return fauxAssistantMessage('done'); }]);
        await processUpdate(update(3, 'after reset marker'));
        expect(context).toContain('after reset marker');
        expect(context).not.toContain('before reset marker');
        const rows = await db.select().from(events);
        expect(rows.map((row) => row.updateId)).toEqual([1, 2, 3]);
        expect(JSON.stringify(rows[0]?.payload)).toContain('before reset marker');
    });
});

test.skipIf(!databaseUrl)('a reset interrupted after the SQLite change is safely retried', async () => {
    await withApp(async ({ db, faux, sessions, processUpdate }) => {
        faux.setResponses([fauxAssistantMessage('done')]);
        await processUpdate(update(1, 'before interrupted reset'));
        const reset = sessions.reset;
        sessions.reset = async (key) => { await reset(key); throw new Error('interrupted reset'); };
        await expect(processUpdate(update(2, '/forget'))).rejects.toThrow('interrupted reset');
        expect((await db.select().from(conversations))[0]?.pendingReset).not.toBeNull();
        sessions.reset = reset;
        await processUpdate(update(2, '/forget'));
        expect((await db.select().from(conversations))[0]?.pendingReset).toBeNull();
        let context = '';
        faux.setResponses([(input) => { context = JSON.stringify(input.messages); return fauxAssistantMessage('done'); }]);
        await processUpdate(update(3, 'after interrupted reset'));
        expect(context).not.toContain('before interrupted reset');
        expect(context).toContain('after interrupted reset');
    });
});

test.skipIf(!databaseUrl)('character selection updates the live prompt and rejects non-admin group changes', async () => {
    await withApp(async ({ faux, sent, processUpdate }) => {
        await processUpdate(update(1000, '/character'));
        expect(sent.at(-1)?.text).toContain('Character:');
        expect(JSON.stringify(sent.at(-1)?.options)).toContain('switch_inline_query_current_chat');
        await processUpdate(update(1, '/character search stargazer'));
        expect(sent.at(-1)?.text).toContain('12: Mira');
        await processUpdate(update(2, '/character set 12'));
        expect(sent.at(-1)?.text).toContain('Mira');
        let customContext = '';
        faux.setResponses([(input) => { customContext = JSON.stringify(input); return fauxAssistantMessage('done'); }]);
        await processUpdate(update(3, 'hello'));
        expect(customContext).toContain('A curious stargazer');
        expect(customContext).toContain('Mira');
        await processUpdate({ update_id: 4, message: { ...message(4, '/character default', group), from: { id: 43, is_bot: false, first_name: 'Bob' } } });
        expect(sent.at(-1)?.text).toContain('administrators');
        await processUpdate(update(5, '/character default'));
        let defaultContext = '';
        faux.setResponses([(input) => { defaultContext = JSON.stringify(input); return fauxAssistantMessage('done'); }]);
        await processUpdate(update(6, 'hello again'));
        expect(defaultContext).toContain('Слюша');
        expect(defaultContext).toContain('hello');
    });
});

test.skipIf(!databaseUrl)('generated character names trigger group replies', async () => {
    await withApp(async ({ faux, settings, processUpdate }) => {
        await settings.setOption({ scope: 'chat', chatId: -100 }, 'randomReplyProbability', 0);
        await settings.setOption({ scope: 'chat', chatId: -100 }, 'names', []);
        await processUpdate(update(100, '/character set 12', group));
        const count = faux.state.callCount;
        faux.setResponses([fauxAssistantMessage('hello')]);
        await processUpdate(update(101, 'Привет, Мира!', group));
        expect(faux.state.callCount).toBe(count + 1);
    });
});

test.skipIf(!databaseUrl)('reply triggers and prompt settings apply global, chat and user overrides', async () => {
    await withApp(async ({ faux, settings, processUpdate }) => {
        await settings.setOption({ scope: 'global' }, 'randomReplyProbability', 0);
        await settings.setOption({ scope: 'global' }, 'names', ['globalname']);
        await settings.setOption({ scope: 'chat', chatId: group.id }, 'names', ['roomname']);
        await settings.setOption({ scope: 'user', userId: user.id }, 'names', ['specialname']);
        await processUpdate(update(1, 'roomname', group));
        expect(faux.state.callCount).toBe(0);
        await processUpdate(update(2, '/language en', group));
        await processUpdate(update(3, '/hatemode', group));
        let prompt = '';
        faux.setResponses([(input) => { prompt = JSON.stringify(input); return fauxAssistantMessage('done'); }]);
        await processUpdate(update(4, 'specialname hello', group));
        expect(faux.state.callCount).toBe(1);
        expect(prompt).toContain('preferred chat language is en');
        expect(prompt).toContain('playful hater');
    });
});

test.skipIf(!databaseUrl)('chat admins can disable and re-enable the shell tool', async () => {
    await withApp(async ({ faux, processUpdate }) => {
        await processUpdate(update(1, '/shell off'));
        let offered: string[] = [];
        faux.setResponses([(input) => { offered = getCurrentTools(input.messages).map((tool) => tool.name); return fauxAssistantMessage('done'); }]);
        await processUpdate(update(2, 'hello'));
        expect(offered).not.toContain('shell');
        expect(offered).toContain('send_reply');
        await processUpdate(update(3, '/shell on'));
        faux.setResponses([(input) => { offered = getCurrentTools(input.messages).map((tool) => tool.name); return fauxAssistantMessage('done'); }]);
        await processUpdate(update(4, 'hello again'));
        expect(offered).toContain('shell');
    });
});

test.skipIf(!databaseUrl)('usage is charged to user and chat and an exhausted user cannot generate', async () => {
    await withApp(async ({ db, faux, sent, processUpdate }) => {
        faux.setResponses([fauxAssistantMessage('a response with tokens')]);
        await processUpdate(update(1, 'slusha first', group));
        const rows = await db.select().from(usage);
        expect(rows).toHaveLength(2);
        const userRow = rows.find((row) => row.accountType === 'user');
        const chatRow = rows.find((row) => row.accountType === 'chat');
        expect(userRow?.accountId).toBe(42);
        expect(chatRow?.accountId).toBe(-100);
        expect(userRow!.inputTokens + userRow!.outputTokens + userRow!.cacheReadTokens).toBeGreaterThan(0);
        expect([chatRow?.inputTokens, chatRow?.outputTokens, chatRow?.cacheReadTokens]).toEqual([userRow?.inputTokens, userRow?.outputTokens, userRow?.cacheReadTokens]);
        await processUpdate(update(2, 'slusha blocked', group));
        expect(faux.state.callCount).toBe(1);
        expect(await db.select().from(events).where(eq(events.updateId, 2))).toHaveLength(1);
        await processUpdate(update(3, '/budget', group));
        expect(sent.at(-1)?.text).toContain('You: ▱▱▱▱▱▱▱▱▱▱ 0%');
        expect(sent.at(-1)?.text).toContain('Chat: not configured');
    }, { user: 1 });
});

test.skipIf(!databaseUrl)('old group messages do not generate; edits and reactions enter later context', async () => {
    await withApp(async ({ db, faux, processUpdate }) => {
        const old = Math.floor(Date.now() / 1000) - 3600;
        await processUpdate(update(1, 'slusha old message', group, old));
        expect(faux.state.callCount).toBe(0);
        await processUpdate({ update_id: 2, edited_message: { ...message(1, 'edited old message', group, old), edit_date: old } });
        await processUpdate({ update_id: 3, edited_message: { ...message(1, 'edited again', group, old), edit_date: old } });
        await processUpdate({ update_id: 4, message_reaction: { chat: group, message_id: 1, user, date: old, old_reaction: [], new_reaction: [{ type: 'emoji', emoji: '👍' }] } });
        let context = '';
        faux.setResponses([(input) => { context = JSON.stringify(input.messages); return fauxAssistantMessage('done'); }]);
        await processUpdate(update(5, 'slusha now', group));
        expect(faux.state.callCount).toBe(1);
        expect(context).toContain('slusha old message -> edited old message');
        expect(context).toContain('edited old message -> edited again');
        expect(context).toContain('Reaction changed on m1');
        const rows = await db.select().from(events);
        expect(rows.map((row) => row.kind)).toEqual(['message', 'edit', 'edit', 'reaction', 'message']);
    });
});


test.skipIf(!databaseUrl)('rotation reseeds only 50 eligible events and releases opted-in history without replaying tools', async () => {
    const app = await appFixture({}, 4096);
    try {
        const { db, faux, sent, processUpdate, actions, sessions } = app;
        faux.setResponses([
            fauxAssistantMessage([fauxToolCall('send_reply', { targetRef: 'm1', text: 'one side effect' })], { stopReason: 'toolUse' }),
            fauxAssistantMessage('done'),
        ]);
        await processUpdate(update(1, 'initial'));
        sessions.shouldRotate = async () => true;
        for (let id = 2; id <= 56; id++) await processUpdate(update(id, `buffer-${id}`), { deferReply: true });
        await processUpdate(update(57, '/optout'));
        await processUpdate(update(58, 'released secret'));
        await processUpdate(update(59, '/optin'));
        const other = { id: 43, is_bot: false, first_name: 'Bob' } as const;
        await processUpdate({ update_id: 60, message: { ...message(60, '/optout'), from: other } });
        await processUpdate({ update_id: 61, message: { ...message(61, 'still hidden'), from: other } });
        const key = { chatId: 42, topicId: 0 };
        expect(await actions.history!(key, { query: 'released secret' })).toBe('');
        await expect(actions.reply(key, { targetRef: 'm58', text: 'hidden' })).rejects.toThrow('not available');
        let context = '';
        faux.setResponses([(input) => { context = JSON.stringify(input.messages); return fauxAssistantMessage('done'); }]);
        await processUpdate(update(62, 'trigger rotation'));
        expect(await actions.history!(key, { query: 'released secret' })).toContain('released secret');
        expect(await actions.history!(key, { query: 'still hidden' })).toBe('');
        await expect(actions.reply(key, { targetRef: 'm61', text: 'hidden' })).rejects.toThrow('not available');
        expect(context).toContain('trigger rotation');
        expect(context).toContain('released secret');
        expect(context).not.toContain('still hidden');
        expect(context).not.toContain('buffer-7');
        expect(context).toContain('buffer-8');
        expect(sent.filter((item) => item.text === 'one side effect')).toHaveLength(1);
        const [released] = await db.select().from(events).where(eq(events.updateId, 58));
        const [hidden] = await db.select().from(events).where(eq(events.updateId, 61));
        expect([released?.optedOut, released?.released, hidden?.released]).toEqual([true, true, false]);
        const [state] = await db.select().from(conversations);
        expect([state?.generation, state?.pendingRotation]).toEqual([1, false]);
    } finally { await app.close(); }
});

test.skipIf(!databaseUrl)('opting out again revokes released history and durable context until another rotation', async () => {
    const app = await appFixture({}, 4096);
    try {
        const { db, faux, processUpdate, actions } = app;
        const key = { chatId: 42, topicId: 0 };
        const other = { id: 43, is_bot: false, first_name: 'Bob' } as const;
        faux.setResponses([fauxAssistantMessage('done')]);
        await processUpdate(update(1, 'eligible before opt-out'));
        await processUpdate(update(2, '/optout'));
        await processUpdate(update(3, 'private rotation secret'));
        await processUpdate(update(4, '/optin'));
        app.sessions.shouldRotate = async () => true;
        let context = '';
        faux.setResponses([(input) => { context = JSON.stringify(input.messages); return fauxAssistantMessage('done'); }]);
        await processUpdate(update(5, 'rotate'));
        expect(context).toContain('private rotation secret');
        app.sessions.shouldRotate = async () => false;
        await processUpdate(update(6, '/optout'));
        expect(await actions.history!(key, { query: 'private rotation secret' })).toBe('');
        await expect(actions.reply(key, { targetRef: 'm3', text: 'hidden' })).rejects.toThrow('not available');
        faux.setResponses([(input) => { context = JSON.stringify(input.messages); return fauxAssistantMessage('done'); }]);
        await processUpdate({ update_id: 7, message: { ...message(7, 'another user'), from: other } });
        expect(context).not.toContain('private rotation secret');
        expect(context).toContain('eligible before opt-out');
        await processUpdate(update(8, '/optin'));
        await app.snapshot();
        faux.setResponses([(input) => { context = JSON.stringify(input.messages); return fauxAssistantMessage('done'); }]);
        await processUpdate({ update_id: 9, message: { ...message(9, 'after reopening'), from: other } });
        expect(context).not.toContain('private rotation secret');
        expect(await actions.history!(key, { query: 'private rotation secret' })).toBe('');
        app.sessions.shouldRotate = async () => true;
        faux.setResponses([(input) => { context = JSON.stringify(input.messages); return fauxAssistantMessage('done'); }]);
        await processUpdate({ update_id: 10, message: { ...message(10, 'rotate again'), from: other } });
        expect(context).toContain('private rotation secret');
        expect(await actions.history!(key, { query: 'private rotation secret' })).toContain('private rotation secret');
        const [secret] = await db.select().from(events).where(eq(events.updateId, 3));
        expect(JSON.stringify(secret?.payload)).toContain('private rotation secret');
    } finally { await app.close(); }
});

test.skipIf(!databaseUrl)('restored session reapplies opt-out redaction before inference', async () => {
    const app = await appFixture({}, 4096);
    try {
        const { faux, processUpdate } = app;
        faux.setResponses([fauxAssistantMessage('done')]);
        await processUpdate(update(1, 'visible before opt-out'));
        await processUpdate(update(2, '/optout'));
        await processUpdate(update(3, 'restored private secret'));
        await processUpdate(update(4, '/optin'));
        app.sessions.shouldRotate = async () => true;
        faux.setResponses([fauxAssistantMessage('done')]);
        await processUpdate(update(5, 'rotate'));
        await app.snapshot();
        await processUpdate(update(6, '/optout'));
        await app.restore();
        const bob = { id: 43, is_bot: false, first_name: 'Bob' } as const;
        let context = '';
        faux.setResponses([(input) => { context = JSON.stringify(input.messages); return fauxAssistantMessage('done'); }]);
        await processUpdate({ update_id: 7, message: { ...message(7, 'another user'), from: bob } });
        expect(context).toContain('visible before opt-out');
        expect(context).not.toContain('restored private secret');
    } finally { await app.close(); }
});

test.skipIf(!databaseUrl)('opting out removes released content and edit-before text across topics', async () => {
    const app = await appFixture({}, 4096);
    try {
        const { actions, faux, processUpdate, sessions } = app;
        const bob = { id: 43, is_bot: false, first_name: 'Bob' } as const;
        function topic(id: number, text: string, thread: number): Update {
            return { update_id: id, message: { ...message(id, text, group), message_thread_id: thread } };
        }
        faux.setResponses([fauxAssistantMessage('done'), fauxAssistantMessage('done')]);
        await processUpdate(topic(1, 'slusha topic one visible', 1));
        await processUpdate(topic(2, 'slusha topic two visible', 2));
        await processUpdate(topic(3, '/optout', 1));
        await processUpdate(topic(4, 'topic one secret', 1));
        await processUpdate(topic(5, 'topic two secret', 2));
        await processUpdate(topic(6, '/optin', 1));
        sessions.shouldRotate = async () => true;
        faux.setResponses([fauxAssistantMessage('done'), fauxAssistantMessage('done')]);
        await processUpdate(topic(7, 'slusha rotate one', 1));
        await processUpdate(topic(8, 'slusha rotate two', 2));
        sessions.shouldRotate = async () => false;
        await processUpdate({ update_id: 9, edited_message: { ...message(5, 'public edit', group), message_thread_id: 2, edit_date: Math.floor(Date.now() / 1000) } });
        let context = '';
        faux.setResponses([(input) => { context = JSON.stringify(input.messages); return fauxAssistantMessage('done'); }]);
        await processUpdate(topic(10, 'slusha show edit', 2));
        expect(context).toContain('topic two secret');
        await processUpdate(topic(11, '/optout', 1));
        faux.setResponses([(input) => { context = JSON.stringify(input.messages); return fauxAssistantMessage('done'); }]);
        await processUpdate({ update_id: 12, message: { ...message(12, 'slusha hi', group), from: bob, message_thread_id: 2 } });
        expect(context).not.toContain('topic two secret');
        expect(context).toContain('topic two visible');
        expect(await actions.history!({ chatId: group.id, topicId: 2 }, { query: 'topic two secret' })).toBe('');
        expect(await actions.history!({ chatId: group.id, topicId: 1 }, { query: 'topic one secret' })).toBe('');
    } finally { await app.close(); }
});

test.skipIf(!databaseUrl)('rotation bounds its seed by the selected model context budget', async () => {
    const app = await appFixture({}, 1000);
    try {
        const { faux, sessions, processUpdate } = app;
        faux.setResponses([fauxAssistantMessage('done')]);
        await processUpdate(update(1, 'small seed'));
        sessions.shouldRotate = async () => true;
        await processUpdate(update(2, `huge-seed-${'x'.repeat(1000)}`), { deferReply: true });
        let context = '';
        faux.setResponses([(input) => { context = JSON.stringify(input.messages); return fauxAssistantMessage('done'); }]);
        await processUpdate(update(3, 'rotate'));
        expect(context).toContain('small seed');
        expect(context).not.toContain('huge-seed-');
    } finally { await app.close(); }
});

test.skipIf(!databaseUrl)('history searches past the most recent 100 events', async () => {
    await withApp(async ({ actions, processUpdate }) => {
        await processUpdate(update(1, 'older unique record'), { deferReply: true });
        for (let id = 2; id <= 105; id++) await processUpdate(update(id, `message ${id}`), { deferReply: true });
        expect(await actions.history!({ chatId: 42, topicId: 0 }, { query: 'older unique record' })).toContain('older unique record');
    });
});

test.skipIf(!databaseUrl)('interrupted seed is reset and retried with a fresh namespace', async () => {
    const app = await appFixture({}, 4096);
    try {
        const { db, faux, sessions, processUpdate } = app;
        faux.setResponses([fauxAssistantMessage('done')]);
        await processUpdate(update(1, 'first seed'));
        sessions.shouldRotate = async () => true;
        await processUpdate(update(2, 'second seed'), { deferReply: true });
        const append = sessions!.append;
        let count = 0;
        sessions!.append = async (key, event) => {
            if (++count === 2) throw new Error('interrupted seed');
            return append(key, event);
        };
        await expect(processUpdate(update(3, 'trigger'))).rejects.toThrow('interrupted seed');
        expect((await db.select().from(conversations))[0]?.pendingRotation).toBe(true);
        sessions!.append = append;
        let context = '';
        faux.setResponses([(input) => { context = JSON.stringify(input.messages); return fauxAssistantMessage('done'); }]);
        await processUpdate(update(3, 'trigger'));
        expect(context).toContain('first seed');
        expect(context).toContain('second seed');
        expect(context).toContain('trigger');
        expect((await db.select().from(conversations))[0]?.pendingRotation).toBe(false);
    } finally { await app.close(); }
});

test.skipIf(!databaseUrl)('rotation uses the latest context threshold and restores recent history after forget', async () => {
    const app = await appFixture({}, 1000);
    try {
        const { db, faux, processUpdate } = app;
        function topic(id: number, text: string, topicId: number): Update {
            return { update_id: id, message: { ...message(id, text, group), message_thread_id: topicId } };
        }
        faux.setResponses([fauxAssistantMessage('ok')]);
        await processUpdate(topic(1, 'slusha old boundary', 1));
        await processUpdate(topic(2, '/forget', 1));
        faux.setResponses([fauxAssistantMessage('ok')]);
        await processUpdate(topic(3, 'slusha small', 1));
        faux.setResponses([fauxAssistantMessage('x'.repeat(4000))]);
        await processUpdate(topic(4, 'slusha grow', 1));
        expect((await db.select().from(conversations).where(eq(conversations.topicId, 1)))[0]?.generation).toBe(1);
        await processUpdate(topic(5, 'other topic secret', 2), { deferReply: true });
        let context = '';
        faux.setResponses([(input) => { context = JSON.stringify(input.messages); return fauxAssistantMessage('ok'); }]);
        await processUpdate(topic(6, 'slusha rotate', 1));
        expect((await db.select().from(conversations).where(eq(conversations.topicId, 1)))[0]?.generation).toBe(2);
        expect(context).toContain('slusha small');
        expect(context).toContain('slusha grow');
        expect(context).toContain('old boundary');
        expect(context).not.toContain('other topic secret');
    } finally { await app.close(); }
});


test.skipIf(!databaseUrl)('restored SQLite catches up committed user and bot context without replaying tools', async () => {
    await withApp(async ({ db, faux, sent, processUpdate, snapshot, restore }) => {
        faux.setResponses([fauxAssistantMessage([fauxToolCall('send_reply', { targetRef: 'm1', text: 'baseline reply' })], { stopReason: 'toolUse' }), fauxAssistantMessage('done')]);
        await processUpdate(update(1, 'snapshot baseline'));
        await snapshot();
        faux.setResponses([
            fauxAssistantMessage([fauxToolCall('send_reply', { targetRef: 'm2', text: 'durable bot reply' })], { stopReason: 'toolUse' }),
            fauxAssistantMessage('done'), fauxAssistantMessage('done'),
        ]);
        await processUpdate(update(2, 'missing user text'));
        await processUpdate(update(3, 'later committed input'));
        const before = await db.select().from(usage);
        const beforeChat = before.find((row) => row.accountType === 'chat')!;
        const beforeTotal = beforeChat.inputTokens + beforeChat.outputTokens + beforeChat.cacheReadTokens;
        await restore();
        let context = '';
        faux.setResponses([(input) => { context = JSON.stringify(input.messages); return fauxAssistantMessage('done'); }]);
        await processUpdate({ update_id: 4, message: { ...message(4, 'new input'), from: { id: 43, is_bot: false, first_name: 'Bob' } } });
        const rows = await db.select().from(usage);
        const bob = rows.find((row) => row.accountType === 'user' && row.accountId === 43)!;
        const chat = rows.find((row) => row.accountType === 'chat')!;
        const bobTotal = bob.inputTokens + bob.outputTokens + bob.cacheReadTokens;
        expect(bobTotal).toBeGreaterThan(0);
        expect(chat.inputTokens + chat.outputTokens + chat.cacheReadTokens - beforeTotal).toBe(bobTotal);
        expect(context.match(/baseline reply/g)).toHaveLength(1);
        expect(context.match(/missing user text/g)).toHaveLength(1);
        expect(context.match(/durable bot reply/g)).toHaveLength(1);
        expect(context.match(/later committed input/g)).toHaveLength(1);
        expect(sent.filter((reply) => reply.text === 'durable bot reply')).toHaveLength(1);
    });
});

test.skipIf(!databaseUrl)('restoring a pre-forget generation rebuilds and marks a new generation', async () => {
    await withApp(async ({ db, faux, processUpdate, snapshot, restore }) => {
        faux.setResponses([fauxAssistantMessage('done')]);
        await processUpdate(update(1, 'old generation text'));
        await snapshot();
        await processUpdate(update(2, '/forget'));
        const [forgotten] = await db.select().from(conversations);
        expect(forgotten?.generation).toBe(1);
        await restore();
        let context = '';
        faux.setResponses([(input) => { context = JSON.stringify(input.messages); return fauxAssistantMessage('done'); }]);
        await processUpdate(update(3, 'after old snapshot'));
        expect(context).toContain('old generation text');
        expect(context).toContain('after old snapshot');
        const [current] = await db.select().from(conversations);
        expect(current?.generation).toBe(2);
        expect(current?.pendingRotation).toBe(false);
    });
});
