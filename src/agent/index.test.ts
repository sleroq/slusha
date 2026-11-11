import { expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
    createModels,
    fauxProvider,
    fauxAssistantMessage,
    fauxText,
    fauxToolCall,
} from '@earendil-works/pi-ai';
import { createAgentSessions, type AgentActions } from './index';

test('persists context, deduplicates submissions, switches models and delegates tools', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'slusha-agent-'));

    const faux = fauxProvider({
        provider: 'opencode-go',
        models: [{ id: 'first' }, { id: 'second' }],
    });
    const models = createModels();
    models.setProvider(faux.provider);
    const calls: unknown[] = [];
    const actions: AgentActions = {
        async reply(key, args) {
            calls.push([key, args]);
            return 'sent';
        },
        async react() {},
        async shell() {
            return 'ok';
        },
    };
    const key = { chatId: -123, topicId: 7 };
    let sessions = await createAgentSessions({ dataDir: dir, actions, models });
    try {
        await sessions.append(key, {
            id: 42,
            generation: 0,
            text: 'm42 prior',
            images: [{ data: 'YWJj', mimeType: 'image/png' }],
        });
        await sessions.append(key, { id: 42, generation: 0, text: 'duplicate' });
        expect(faux.state.callCount).toBe(0);
        await sessions.close();
        sessions = await createAgentSessions({ dataDir: dir, actions, models });
        expect(sessions.discovered).toEqual([key]);
        await sessions.close();

        const approved: (typeof key)[] = [];
        sessions = await createAgentSessions({
            dataDir: dir,
            actions,
            models,
            recoverOnStartup: (found) => {
                approved.push(found);
                return 'one';
            },
        });
        expect(approved).toEqual([key]);
        faux.setResponses([
            (context, _options, _state, model) => {
                expect(model.id).toBe('first');
                expect(JSON.stringify(context.messages)).toContain('m42 prior');
                expect(JSON.stringify(context.messages)).not.toContain('Telegram message ref');
                expect(JSON.stringify(context.messages)).toContain('YWJj');
                expect(JSON.stringify(context.messages)).not.toContain('duplicate');
                return fauxAssistantMessage(
                    [fauxToolCall('send_reply', { targetRef: '42', text: 'hello' })],
                    { stopReason: 'toolUse' },
                );
            },
            fauxAssistantMessage([fauxText('done')]),
        ]);
        const result = await sessions.run(key, {
            eventId: 1,
            generation: 0,
            requestId: 'one',
            model: 'first',
            text: 'respond',
        });
        expect(result.settlement.status).toBe('done');
        expect(calls).toEqual([[key, { targetRef: '42', text: 'hello' }]]);
        expect(Object.keys(result.cumulativeUsage.models)).toContain('opencode-go/first');
        const before = faux.state.callCount;
        await sessions.run(key, {
            eventId: 1,
            generation: 0,
            requestId: 'one',
            model: 'first',
            text: 'respond',
        });
        expect(faux.state.callCount).toBe(before);
        faux.setResponses([
            (context, _options, _state, model) => {
                expect(model.id).toBe('second');
                expect(JSON.stringify(context.messages)).toContain('prior');
                return fauxAssistantMessage('done');
            },
        ]);
        await sessions.run(key, {
            eventId: 1,
            generation: 0,
            requestId: 'two',
            model: 'second',
            text: 'again',
        });
        await sessions.reset(key);
        faux.setResponses([
            (context) => {
                expect(JSON.stringify(context.messages)).not.toContain('prior');
                return fauxAssistantMessage('done');
            },
        ]);
        await sessions.run(key, {
            eventId: 1,
            generation: 0,
            requestId: 'three',
            model: 'first',
            text: 'new',
        });
    } finally {
        await sessions.close();
        await rm(dir, { recursive: true, force: true });
    }
});

test.each([false, true])(
    'startup recovery %s controls an interrupted persisted run',
    async (allowed) => {
        const dir = await mkdtemp(join(tmpdir(), 'slusha-recovery-'));
        const child = Bun.spawn(
            [process.execPath, new URL('./recovery-fixture.ts', import.meta.url).pathname, dir],
            {
                stdout: 'pipe',
                stderr: 'pipe',
            },
        );
        const reader = child.stdout.getReader();
        const signal = await reader.read();
        expect(new TextDecoder().decode(signal.value)).toContain('model-started');
        child.kill('SIGKILL');
        await child.exited;
        reader.releaseLock();

        const faux = fauxProvider({ provider: 'opencode-go', models: [{ id: 'first' }] });
        const models = createModels();
        models.setProvider(faux.provider);
        const replies: string[] = [];
        const actions: AgentActions = {
            async reply(_key, args) {
                replies.push(args.text);
            },
            async react() {},
            async shell() {
                return 'ok';
            },
        };
        const key = { chatId: -123, topicId: 7 };
        if (allowed) {
            faux.setResponses([
                fauxAssistantMessage(
                    [fauxToolCall('send_reply', { targetRef: 'm42', text: 'old reply' })],
                    { stopReason: 'toolUse' },
                ),
                fauxAssistantMessage('done'),
            ]);
        } else {
            faux.setResponses([fauxAssistantMessage('fresh answer')]);
        }
        const sessions = await createAgentSessions({
            dataDir: dir,
            actions,
            models,
            recoverOnStartup: () => {
                if (allowed) return 'old';
                return undefined;
            },
        });
        try {
            if (allowed) {
                const old = await sessions.run(key, {
                    eventId: 1,
                    generation: 0,
                    requestId: 'old',
                    model: 'first',
                    text: 'old request',
                });
                expect(old.settlement.status).toBe('done');
                expect(replies).toEqual(['old reply']);
                expect(faux.state.callCount).toBe(2);
            } else {
                const fresh = await sessions.run(key, {
                    eventId: 1,
                    generation: 0,
                    requestId: 'new',
                    model: 'first',
                    text: 'fresh request',
                });
                expect(fresh.settlement.status).toBe('done');
                expect(replies).toEqual([]);
                expect(faux.state.callCount).toBe(1);
                const old = await sessions.run(key, {
                    eventId: 1,
                    generation: 0,
                    requestId: 'old',
                    model: 'first',
                    text: 'old request',
                });
                expect(old.settlement.status).toBe('unanswered');
                expect(faux.state.callCount).toBe(1);
            }
        } finally {
            await sessions.close();
            await rm(dir, { recursive: true, force: true });
        }
    },
);

test('behavior prompts are durable, append only on change, and reset with the session', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'slusha-prompts-'));
    const faux = fauxProvider({ provider: 'opencode-go', models: [{ id: 'first' }] });
    const models = createModels();
    models.setProvider(faux.provider);
    const actions: AgentActions = {
        async reply() {},
        async react() {},
        async shell() {
            return '';
        },
    };
    const key = { chatId: 1, topicId: 0 };
    let sessions = await createAgentSessions({ dataDir: dir, actions, models });
    const seen: string[][] = [];

    async function run(id: string, instructions: string) {
        faux.setResponses([
            (context) => {
                seen.push(
                    context.messages
                        .filter((message) => message.role === 'system')
                        .map((message) => message.sections?.['Behavioral instructions'] ?? '')
                        .filter(Boolean),
                );
                return fauxAssistantMessage('done');
            },
        ]);
        await sessions.run(key, {
            eventId: Number(id),
            generation: 0,
            requestId: id,
            model: 'first',
            text: id,
            instructions,
        });
    }
    try {
        await run('1', 'first prompt');
        await run('2', 'first prompt');
        await sessions.close();
        sessions = await createAgentSessions({ dataDir: dir, actions, models });
        await run('3', 'second prompt');
        await run('3', 'different retry prompt');
        await run('4', 'first prompt');

        await sessions.reset(key);
        await run('5', 'first prompt');
        expect(seen).toEqual([
            ['first prompt'],
            ['first prompt'],
            ['first prompt', 'second prompt'],
            ['first prompt', 'second prompt', 'first prompt'],
            ['first prompt'],
        ]);
    } finally {
        await sessions.close();
        await rm(dir, { recursive: true, force: true });
    }
});
