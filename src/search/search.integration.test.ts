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
import { createAgentSessions, type AgentActions } from '../agent';
import { createSearch } from './index';

test('optional web search delegates through the durable agent to Radius', async () => {
    const token = 'test-secret-token';
    const requests: { authorization: string | null; body: unknown }[] = [];
    let status = 200;
    let body = JSON.stringify({
        results: [{ title: 'Example', url: 'https://example.com', text: 'A result' }],
        provider: { attribution: 'Search by Example' },
    });
    const server = Bun.serve({
        port: 0,
        async fetch(request) {
            requests.push({
                authorization: request.headers.get('authorization'),
                body: await request.json(),
            });
            return new Response(body, { status, headers: { 'content-type': 'application/json' } });
        },
    });

    const dir = await mkdtemp(join(tmpdir(), 'slusha-search-'));
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
    async function run(id: string) {
        return sessions.run(key, {
            eventId: Number(id),
            generation: 0,
            requestId: id,
            model: 'first',
            text: 'search',
        });
    }

    try {
        faux.setResponses([
            (context) => {
                expect(JSON.stringify(context)).not.toContain('web_search');
                return fauxAssistantMessage('done');
            },
        ]);
        await run('1');
        expect(requests).toEqual([]);
        await sessions.close();
        sessions = await createAgentSessions({
            dataDir: dir,
            models,
            actions: { ...actions, search: createSearch(token, `${server.url}v1/search`) },
        });
        expect(requests).toEqual([]);
        faux.setResponses([
            (context) => {
                const serialized = JSON.stringify(context);
                expect(serialized).toContain('web_search');
                expect(serialized).toContain('query');
                return fauxAssistantMessage(
                    [fauxToolCall('web_search', { query: 'latest news' })],
                    { stopReason: 'toolUse' },
                );
            },
            (context) => {
                const serialized = JSON.stringify(context);
                expect(serialized).toContain('Example');
                expect(serialized).toContain('https://example.com');
                expect(serialized).toContain('A result');
                expect(serialized).toContain('Search by Example');
                expect(serialized).not.toContain(token);
                return fauxAssistantMessage('done');
            },
        ]);
        expect((await run('2')).settlement.status).toBe('done');
        expect(requests).toEqual([
            { authorization: `Bearer ${token}`, body: { query: 'latest news' } },
        ]);
        status = 403;
        body = JSON.stringify({ error: `terms_acceptance_required ${token}` });
        faux.setResponses([
            fauxAssistantMessage([fauxToolCall('web_search', { query: 'again' })], {
                stopReason: 'toolUse',
            }),
            (context) => {
                const serialized = JSON.stringify(context);
                expect(serialized).toContain('HTTP 403');
                expect(serialized).not.toContain(token);
                return fauxAssistantMessage('done');
            },
        ]);
        expect((await run('3')).settlement.status).toBe('done');
        status = 200;
        body = JSON.stringify({ results: [{ title: 'Missing fields' }] });
        faux.setResponses([
            fauxAssistantMessage([fauxToolCall('web_search', { query: 'invalid' })], {
                stopReason: 'toolUse',
            }),
            (context) => {
                expect(JSON.stringify(context)).toContain('Invalid Radius search response');
                return fauxAssistantMessage('done');
            },
        ]);
        expect((await run('4')).settlement.status).toBe('done');
    } finally {
        await sessions.close();
        await server.stop();
        await rm(dir, { recursive: true, force: true });
    }
});
