import { mkdir, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import type { TelemetryContext } from '@earendil-works/pi-telemetry';
import { BACKGROUND_CONTEXT } from '@earendil-works/chord/context';
import { obj, str } from '@earendil-works/pi-schema';
import { createModels, type Models, type UserMessage } from '@earendil-works/pi-ai';
import { opencodeGoProvider } from '@earendil-works/pi-ai/providers/opencode-go';
import {
    createRegistry,
    defineExtension,
    defineTool,
    Harness,
    section,
} from '@earendil-works/pi-durable';
import { openNodeSqliteStorage } from '@earendil-works/pi-durable/storage/sqlite/node';

export class UnsupportedImageModelError extends Error {
    constructor(model: string) {
        super(`Model ${model} does not support images already in the session`);
        this.name = 'UnsupportedImageModelError';
    }
}

export type AgentKey = { chatId: number; topicId: number };
export type AgentImage = { data: string; mimeType: string };
export type AgentEvent = {
    id: number;
    generation: number;
    namespace?: string;
    text: string;
    images?: AgentImage[];
    system?: boolean;
};
export type AgentInput = {
    eventId: number;
    generation: number;
    requestId: string;
    model: string;
    text: string;
    images?: AgentImage[];
    instructions?: string;
    shellEnabled?: boolean;
};
export const defaultPersonality =
    'You are Слюша: cute, silly, and brief. Speak Russian by default; use another language when requested or when the conversation calls for it. Write like a person, not an assistant.';
export type AgentActions = {
    reply(key: AgentKey, input: { targetRef: string; text: string }): Promise<string | void>;
    react(key: AgentKey, input: { targetRef: string; emoji: string }): Promise<string | void>;
    shell(key: AgentKey, input: { command: string }): Promise<string>;
    history?(this: void, key: AgentKey, input: { query: string }): Promise<string>;
};
export type AgentSessionsOptions = {
    dataDir: string;
    actions: AgentActions;
    models?: Models;
    telemetry?: TelemetryContext;
    recoverOnStartup?: (key: AgentKey) => string | undefined | Promise<string | undefined>;
};

function content(text: string, images: AgentImage[] = []): UserMessage['content'] {
    return [
        { type: 'text', text },
        ...images.map((image) => ({ type: 'image' as const, ...image })),
    ];
}

function extension(key: AgentKey, actions: AgentActions) {
    function output(text: string | void) {
        return { output: [{ type: 'text' as const, text: text ?? 'Done' }] };
    }

    const tools: import('@earendil-works/pi-durable').ToolRegistration[] = [
        defineTool({
            name: 'send_reply',
            description: 'Send a Telegram reply to a reference ID.',
            parameters: obj({ targetRef: str(), text: str() }),
            execute: async (args) => output(await actions.reply(key, args)),
        }),
        defineTool({
            name: 'react',
            description: 'React to a Telegram message by reference ID.',
            parameters: obj({ targetRef: str(), emoji: str() }),
            execute: async (args) => output(await actions.react(key, args)),
        }),
        defineTool({
            name: 'shell',
            description: 'Run a host-authorized command.',
            parameters: obj({ command: str() }),
            execute: async (args) => output(await actions.shell(key, args)),
        }),
    ];

    if (actions.history) {
        const history = actions.history;
        tools.push(
            defineTool({
                name: 'history',
                description: 'Search host-scoped conversation history.',
                parameters: obj({ query: str() }),
                execute: async (args) => output(await history(key, args)),
            }),
        );
    }

    return defineExtension({
        name: 'slusha',
        sections: [
            section(
                'slusha',
                () =>
                    'Communicate to Telegram only with send_reply or react, using the supplied message reference IDs. Your final text is not delivered to Telegram.',
                { tag: false },
            ),
        ],
        tools,
    });
}

const checkpointSchema = z.object({
    generation: z.number().int().nonnegative(),
    eventId: z.number().int().nonnegative(),
});
const legacyEventSchema = z.strictObject({ id: z.number().int().nonnegative() });

type Session = {
    harness: Harness;
    root: Awaited<ReturnType<Harness['root']>>;
    shell: import('@earendil-works/pi-durable').ToolRegistration;
    tail: Promise<unknown>;
};

export async function createAgentSessions({
    dataDir,
    actions,
    models: providedModels,
    recoverOnStartup,
    telemetry,
}: AgentSessionsOptions) {
    await mkdir(dataDir, { recursive: true });
    const defaults = createModels();
    if (!providedModels) defaults.setProvider(opencodeGoProvider());
    const models = providedModels ?? defaults;
    const sessions = new Map<string, Promise<Session>>();
    const deniedRecovery = new Set<string>();
    let closed = false;

    function name(key: AgentKey) {
        return `${key.chatId}_${key.topicId}`;
    }
    function open(key: AgentKey, approvedRequest?: string): Promise<Session> {
        if (closed) throw new Error('Agent sessions are closed');
        const id = name(key);
        let session = sessions.get(id);
        if (!session) {
            session = (async () => {
                const registry = createRegistry();
                const slusha = extension(key, actions);
                registry.install(slusha);
                const shell = slusha.tools?.find((tool) => tool.name === 'shell');
                if (!shell) throw new Error('Shell tool is missing');

                const storage = await openNodeSqliteStorage(join(dataDir, `${id}.sqlite`));
                const harness = await Harness.open(
                    storage,
                    { models, registry, telemetry },
                    BACKGROUND_CONTEXT,
                );
                const root = await harness.root(BACKGROUND_CONTEXT);

                if (deniedRecovery.has(id)) {
                    await root.abort(BACKGROUND_CONTEXT, { background: true });
                    deniedRecovery.delete(id);
                } else if (approvedRequest !== undefined) {
                    const inspection = await harness.inspect(BACKGROUND_CONTEXT);
                    const inputs = inspection.submissions.filter(
                        (item) => item.conversationId === root.id && item.type === 'input',
                    );
                    if (
                        inputs.length &&
                        inputs.every((item) => item.requestId === `run:${approvedRequest}`)
                    ) {
                        harness.resume();
                    } else {
                        await root.abort(BACKGROUND_CONTEXT, { background: true });
                    }
                } else {
                    harness.resume();
                }
                return { harness, root, shell, tail: Promise.resolve() };
            })();
            sessions.set(id, session);
        }
        return session;
    }
    async function inSession<T>(
        key: AgentKey,
        operation: (session: Session) => Promise<T>,
    ): Promise<T> {
        const session = await open(key);
        const result = session.tail.then(() => operation(session));
        session.tail = result.catch(() => {});
        return result;
    }

    const discovered: AgentKey[] = [];
    for (const file of await readdir(dataDir)) {
        const match = /^(-?\d+)_(-?\d+)\.sqlite$/.exec(file);
        if (!match) continue;
        const key = { chatId: Number(match[1]), topicId: Number(match[2]) };
        discovered.push(key);
        const approvedRequest = await recoverOnStartup?.(key);
        if (approvedRequest !== undefined) {
            await open(key, approvedRequest);
        } else {
            deniedRecovery.add(name(key));
        }
    }

    return {
        discovered,
        append(key: AgentKey, event: AgentEvent) {
            return inSession(key, async ({ root }) => {
                let message: UserMessage | import('@earendil-works/pi-ai').SystemMessage = {
                    role: 'user',
                    content: content(event.text, event.images),
                    timestamp: Date.now(),
                };
                if (event.system)
                    message = { role: 'system', content: event.text, timestamp: Date.now() };
                const submission = await root.submit(
                    {
                        type: 'write',
                        requestId: `event:${event.namespace ?? 'generation:0'}:${event.id}`,
                        entry: {
                            kind: 'slusha.event',
                            data: { eventId: event.id, generation: event.generation },
                            model: [message],
                        },
                    },
                    BACKGROUND_CONTEXT,
                );
                return submission.wait(BACKGROUND_CONTEXT);
            });
        },
        checkpoint(key: AgentKey) {
            return inSession(key, async ({ root }) => {
                let cursor: import('@earendil-works/pi-durable').Cursor | undefined;
                do {
                    const page = await root.entries(
                        { order: 'descending' },
                        100,
                        cursor,
                        BACKGROUND_CONTEXT,
                    );
                    for (const entry of page.items) {
                        if (
                            !['slusha.input', 'slusha.event', 'slusha.checkpoint'].includes(
                                entry.kind,
                            )
                        )
                            continue;
                        if (
                            entry.kind === 'slusha.event' &&
                            legacyEventSchema.safeParse(entry.data).success
                        )
                            return undefined;
                        return checkpointSchema.parse(entry.data);
                    }
                    cursor = page.next;
                } while (cursor);
                return undefined;
            });
        },
        mark(
            key: AgentKey,
            checkpoint: { generation: number; eventId: number },
            namespace: string,
        ) {
            return inSession(key, async ({ root }) => {
                const submission = await root.submit(
                    {
                        type: 'write',
                        requestId: `checkpoint:${namespace}`,
                        entry: { kind: 'slusha.checkpoint', data: checkpoint },
                    },
                    BACKGROUND_CONTEXT,
                );
                await submission.wait(BACKGROUND_CONTEXT);
            });
        },
        redact(key: AgentKey, eventIds: readonly number[], requestId: string) {
            return inSession(key, async ({ root }) => {
                const ids = new Set(eventIds);
                const view = await root.context(BACKGROUND_CONTEXT);
                const edits: import('@earendil-works/pi-durable').ContextEdit[] = [];
                for (const [index, entry] of view.entries.entries()) {
                    if (view.contributions[index]?.length === 0) continue;
                    if (entry.kind !== 'slusha.event' && entry.kind !== 'slusha.input') continue;
                    const current = checkpointSchema.safeParse(entry.data);
                    const legacy = legacyEventSchema.safeParse(entry.data);
                    let eventId = current.data?.eventId;
                    if (eventId === undefined) eventId = legacy.data?.id;
                    if (eventId !== undefined && ids.has(eventId))
                        edits.push({ target: entry.id, action: 'omit' });
                }
                if (edits.length === 0) return;
                const submission = await root.submit(
                    {
                        type: 'write',
                        requestId: `privacy:${requestId}`,
                        entry: { kind: 'slusha.privacy', data: { eventIds: [...eventIds] }, edits },
                    },
                    BACKGROUND_CONTEXT,
                );
                await submission.wait(BACKGROUND_CONTEXT);
            });
        },
        usage(key: AgentKey) {
            return inSession(key, ({ harness }) => harness.usage(BACKGROUND_CONTEXT));
        },
        seedBudget(modelId: string) {
            const model = models.getModel('opencode-go', modelId);
            if (!model) throw new Error(`Unknown model ${modelId}`);
            return Math.floor(model.contextWindow * 0.4);
        },
        shouldRotate(key: AgentKey, modelId: string) {
            return inSession(key, async ({ root }) => {
                const model = models.getModel('opencode-go', modelId);
                if (!model) return false;
                const messages = (await root.context(BACKGROUND_CONTEXT)).messages;
                const latest = messages.findLast((message) => message.role === 'assistant');
                if (!latest || latest.role !== 'assistant') return false;
                if (Date.now() - latest.timestamp >= 10 * 60 * 1000) return true;
                const usage = latest.usage;
                return (
                    usage.input + usage.cacheRead + usage.cacheWrite + usage.output >=
                    model.contextWindow * 0.7
                );
            });
        },
        recover(key: AgentKey, requestId: string) {
            return inSession(key, async ({ root, harness }) => {
                const record = await root.commit(
                    (tx) => tx.submissionByRequest(root.id, `run:${requestId}`),
                    BACKGROUND_CONTEXT,
                );
                if (!record) return undefined;
                const submission = await harness.submission(record.id, BACKGROUND_CONTEXT);
                if (!submission) throw new Error('Persisted submission is missing');
                const settlement = await submission.wait(BACKGROUND_CONTEXT);
                return { settlement, cumulativeUsage: await harness.usage(BACKGROUND_CONTEXT) };
            });
        },
        run(key: AgentKey, input: AgentInput) {
            return inSession(key, async ({ root, harness, shell }) => {
                await root.waitForIdle(BACKGROUND_CONTEXT);
                const existing = await root.commit(
                    (tx) => tx.submissionByRequest(root.id, `run:${input.requestId}`),
                    BACKGROUND_CONTEXT,
                );
                if (existing) {
                    const submission = await harness.submission(existing.id, BACKGROUND_CONTEXT);
                    if (!submission) throw new Error('Persisted submission is missing');
                    return {
                        settlement: await submission.wait(BACKGROUND_CONTEXT),
                        cumulativeUsage: await harness.usage(BACKGROUND_CONTEXT),
                    };
                }

                const model = models.getModel('opencode-go', input.model);
                const view = await root.context(BACKGROUND_CONTEXT);
                const messages = view.messages;
                const hasImages =
                    (input.images?.length ?? 0) > 0 ||
                    messages.some(
                        (message) =>
                            Array.isArray(message.content) &&
                            message.content.some((block) => block.type === 'image'),
                    );
                if (model && hasImages && !model.input.includes('image')) {
                    throw new UnsupportedImageModelError(input.model);
                }

                let tools: import('@earendil-works/pi-durable').AgentChange['tools'] = null;
                if (input.shellEnabled === false) tools = { remove: [shell] };
                await root.configure(
                    {
                        model: { provider: 'opencode-go', modelId: input.model },
                        instructions: '',
                        tools,
                    },
                    BACKGROUND_CONTEXT,
                );

                const instructions = input.instructions ?? defaultPersonality;
                const previous = view.entries.findLast(
                    (entry, index) =>
                        entry.kind === 'slusha.prompt' && view.contributions[index]?.length !== 0,
                );
                if (previous?.data !== instructions) {
                    const prompt = await root.submit(
                        {
                            type: 'write',
                            requestId: `prompt:${crypto.randomUUID()}`,
                            entry: {
                                kind: 'slusha.prompt',
                                data: instructions,
                                model: [
                                    {
                                        role: 'system',
                                        content: '',
                                        sections: { 'Behavioral instructions': instructions },
                                        timestamp: Date.now(),
                                    },
                                ],
                            },
                        },
                        BACKGROUND_CONTEXT,
                    );
                    await prompt.wait(BACKGROUND_CONTEXT);
                }

                const submission = await root.submit(
                    {
                        type: 'input',
                        requestId: `run:${input.requestId}`,
                        content: content(input.text, input.images),
                        entry: {
                            kind: 'slusha.input',
                            data: { generation: input.generation, eventId: input.eventId },
                        },
                    },
                    BACKGROUND_CONTEXT,
                );
                const settlement = await submission.wait(BACKGROUND_CONTEXT);
                return { settlement, cumulativeUsage: await harness.usage(BACKGROUND_CONTEXT) };
            });
        },
        reset(key: AgentKey) {
            return inSession(key, async ({ root }) => {
                await root.reset(undefined, BACKGROUND_CONTEXT);
            });
        },
        async close() {
            closed = true;
            await Promise.all(
                [...sessions.values()].map(async (session) =>
                    (await session).harness.close(BACKGROUND_CONTEXT),
                ),
            );
        },
    };
}
export type AgentSessions = Awaited<ReturnType<typeof createAgentSessions>>;
