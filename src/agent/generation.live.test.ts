import { expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createModels } from '@earendil-works/pi-ai';
import { opencodeGoProvider } from '@earendil-works/pi-ai/providers/opencode-go';
import { z } from 'zod';
import { createAgentSessions, type AgentActions, type AgentKey } from './index';

const enabled = process.env.RUN_LIVE_GENERATION_TESTS === '1' && !!process.env.OPENCODE_API_KEY;
const modelId = process.env.LIVE_MODEL || 'minimax-m3';
const judgeId = process.env.LIVE_JUDGE_MODEL || 'minimax-m3';
const imageModelId = process.env.LIVE_IMAGE_MODEL || 'minimax-m3';

type Action =
    | { kind: 'reply'; key: AgentKey; targetRef: string; text: string }
    | { kind: 'react'; key: AgentKey; targetRef: string; emoji: string };

test.skipIf(!enabled)(
    'live Slusha conversations use Telegram tools and retain context after reopen',
    async () => {
        const models = createModels();
        models.setProvider(opencodeGoProvider());
        const model = models.getModel('opencode-go', modelId);
        if (!model)
            throw new Error(`LIVE_MODEL ${modelId} is not in the pi-ai OpenCode Go catalog`);
        const judgeModel = models.getModel('opencode-go', judgeId);
        if (!judgeModel)
            throw new Error(`LIVE_JUDGE_MODEL ${judgeId} is not in the pi-ai OpenCode Go catalog`);
        const dir = await mkdtemp(join(tmpdir(), 'slusha-live-'));
        const calls: Action[] = [];
        const actions: AgentActions = {
            async reply(key, input) {
                calls.push({ kind: 'reply', key, ...input });
                return 'Sent';
            },
            async react(key, input) {
                calls.push({ kind: 'react', key, ...input });
                return 'Reaction sent';
            },
            async shell() {
                throw new Error('Shell is not available in this fixture');
            },
        };
        const privateKey = { chatId: 42, topicId: 0 };
        const groupKey = { chatId: -100, topicId: 7 };
        let sessions = await createAgentSessions({ dataDir: dir, actions });
        const evaluations: { fixture: string; context: string; response: string }[] = [];
        try {
            async function reply(
                fixture: string,
                key: AgentKey,
                requestId: string,
                text: string,
                ref: string,
                context: string,
            ) {
                const start = calls.length;
                const result = await sessions.run(key, {
                    eventId: 1,
                    generation: 0,
                    requestId,
                    model: modelId,
                    text,
                });
                expect(result.settlement.status).toBe('done');
                const actual = calls.slice(start);
                expect(actual.length).toBeGreaterThan(0);
                for (const call of actual) {
                    expect(call.key).toEqual(key);
                    expect(call.targetRef).toBe(ref);
                }
                const replies = actual.filter((call) => call.kind === 'reply');
                expect(replies.length).toBeGreaterThan(0);
                const response = replies.map((call) => call.text).join('\n');
                expect(response.trim().length).toBeGreaterThan(0);
                evaluations.push({ fixture, context, response });
            }

            await reply(
                'private',
                privateKey,
                'private',
                '[m101] Alice: Привет, Слюша! Подскажи одну простую идею для завтрака без яиц.',
                'm101',
                'Alice asks in Russian for one simple egg-free breakfast idea.',
            );
            await sessions.append(groupKey, {
                id: 201,
                generation: 0,
                text: '[m201] Борис: На пикник возьмём термос с чаем.',
            });
            await reply(
                'group reply',
                groupKey,
                'group',
                '[m202] Аня (reply to m201): Слюша, что Борис предложил взять? Ответь мне.',
                'm202',
                'Boris proposed taking a thermos of tea to a picnic; Anya asks what he proposed. Reply to Anya.',
            );
            await reply(
                'memory setup',
                privateKey,
                'memory-setup',
                '[m102] Alice: Запомни, пожалуйста: моего кота зовут Персик. Какое милое имя!',
                'm102',
                'Alice says her cat is named Персик.',
            );
            await sessions.close();
            sessions = await createAgentSessions({ dataDir: dir, actions });
            expect(sessions.discovered).toContainEqual(privateKey);
            await reply(
                'memory after reopen',
                privateKey,
                'memory-followup',
                '[m103] Alice: Напомни, как зовут моего кота?',
                'm103',
                'Earlier Alice said her cat is named Персик; she now asks its name.',
            );

            const beforeReaction = calls.length;
            const reaction = await sessions.run(groupKey, {
                eventId: 1,
                generation: 0,
                requestId: 'reaction',
                model: modelId,
                text: '[m203] Аня: Слюша, пожалуйста, только поставь реакцию 👍 на это сообщение, без ответа текстом.',
            });
            expect(reaction.settlement.status).toBe('done');
            const reactionCalls = calls.slice(beforeReaction);
            expect(reactionCalls).toEqual([
                { kind: 'react', key: groupKey, targetRef: 'm203', emoji: '👍' },
            ]);

            const judge = await models
                .stream(
                    judgeModel,
                    {
                        systemPrompt:
                            'You are a strict evaluator. Return only a JSON array, one object per fixture, with fields fixture, relevance, persona, context, reason. Each score is an integer 1 to 5. Relevance means answers the request; persona means brief, natural and friendly rather than formal assistant; context means uses supplied facts correctly. Score context below 3 only for a contradiction or omission of an essential supplied fact. Do not invent constraints or assume ordinary ingredients contain unrelated ingredients. Do not penalize harmless playful style. Judge each response independently.',
                        messages: [
                            {
                                role: 'user',
                                content: JSON.stringify(evaluations),
                                timestamp: Date.now(),
                            },
                        ],
                    },
                    { maxTokens: 1500, sessionId: crypto.randomUUID() },
                )
                .result();
            if (judge.stopReason === 'error' || judge.stopReason === 'aborted') {
                const detail = (judge.errorMessage || judge.stopReason).replaceAll(
                    process.env.OPENCODE_API_KEY || '',
                    '[REDACTED]',
                );
                throw new Error(`Judge failed: ${detail}`);
            }
            const text = judge.content
                .filter((block) => block.type === 'text')
                .map((block) => block.text)
                .join('');
            const json = text.match(/\[[\s\S]*\]/)?.[0];
            if (!json) throw new Error(`Judge returned no JSON array: ${text}`);
            const rating = z.number().int().min(1).max(5);
            const parsed = z
                .array(
                    z.object({
                        fixture: z.string(),
                        relevance: rating,
                        persona: rating,
                        context: rating,
                        reason: z.string(),
                    }),
                )
                .safeParse(JSON.parse(json));
            if (!parsed.success || parsed.data.length !== evaluations.length)
                throw new Error(`Invalid judge results: ${text}`);
            for (const evaluation of evaluations) {
                const matches = parsed.data.filter((item) => item.fixture === evaluation.fixture);
                const score = matches[0];
                if (
                    matches.length !== 1 ||
                    !score ||
                    Math.min(score.relevance, score.persona, score.context) < 3
                ) {
                    throw new Error(
                        `Judge failed ${evaluation.fixture}: ${JSON.stringify({ evaluation, matches })}`,
                    );
                }
            }
        } finally {
            await sessions.close();
            await rm(dir, { recursive: true, force: true });
        }
    },
    240_000,
);

test.skipIf(!enabled)(
    'live image-capable model receives an image and replies to its reference',
    async () => {
        const dir = await mkdtemp(join(tmpdir(), 'slusha-live-image-'));
        const replies: { targetRef: string; text: string }[] = [];
        const sessions = await createAgentSessions({
            dataDir: dir,
            actions: {
                async reply(_key, input) {
                    replies.push(input);
                },
                async react() {},
                async shell() {
                    throw new Error('Shell is not available in this fixture');
                },
            },
        });

        try {
            const result = await sessions.run(
                { chatId: 43, topicId: 0 },
                {
                    eventId: 301,
                    generation: 0,
                    requestId: 'image',
                    model: imageModelId,
                    text: '[m301] Alice: Какой основной цвет этой картинки? Ответь коротко.',
                    images: [
                        {
                            mimeType: 'image/png',
                            data: 'iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAAAS0lEQVR42u3PQQkAAAgAsetfWiP4FgYrsKZeS0BAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEDgsqnc8OJg6Ln3AAAAAElFTkSuQmCC',
                        },
                    ],
                },
            );
            if (result.settlement.status !== 'done') {
                throw new Error(
                    `Image generation failed: ${JSON.stringify(result.settlement).replaceAll(process.env.OPENCODE_API_KEY || '', '[REDACTED]')}`,
                );
            }
            expect(replies.length).toBeGreaterThan(0);
            expect(replies.every((reply) => reply.targetRef === 'm301')).toBe(true);
            expect(
                replies
                    .map((reply) => reply.text)
                    .join(' ')
                    .toLowerCase(),
            ).toMatch(/красн|red/);
        } finally {
            await sessions.close();
            await rm(dir, { recursive: true, force: true });
        }
    },
    120_000,
);
