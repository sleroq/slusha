import { Composer } from 'grammy';
import { generateText, ModelMessage } from 'ai';
import { Config } from '../../config.ts';
import logger from '../../logger.ts';
import { SlushaContext } from '../setup-bot.ts';
import { makeNotesHistory } from '../../history.ts';
import {
    buildChatInfoBlock,
    buildChatPromptAddition,
    isTelegramCommentsHistory,
} from '../../ai/chat-context.ts';
import { resolveGenerationPolicy } from '../../ai/generation-policy.ts';
import { buildGenerationTelemetryMetadata } from '../../ai/telemetry-metadata.ts';
import { getUsageSnapshot } from '../usage-window.ts';
import {
    aiFailuresTotal,
    aiFinishReasonTotal,
    aiRequestDurationSeconds,
    aiRequestsTotal,
    aiTokensTotal,
    errorType,
} from '../../app/metrics.ts';

function tokenCountFromUsage(usage: unknown, key: string): number | undefined {
    if (typeof usage !== 'object' || usage === null) {
        return undefined;
    }

    const raw = Reflect.get(usage, key);
    return typeof raw === 'number' && Number.isFinite(raw) && raw >= 0
        ? raw
        : undefined;
}

function observeTokenUsage(labels: {
    task: string;
    provider: string;
    model_ref: string;
}, usage: unknown): void {
    const inputTokens = tokenCountFromUsage(usage, 'inputTokens');
    const outputTokens = tokenCountFromUsage(usage, 'outputTokens');
    const totalTokens = tokenCountFromUsage(usage, 'totalTokens');

    if (inputTokens !== undefined) {
        aiTokensTotal.inc({ ...labels, token_type: 'input' }, inputTokens);
    }
    if (outputTokens !== undefined) {
        aiTokensTotal.inc({ ...labels, token_type: 'output' }, outputTokens);
    }
    if (totalTokens !== undefined) {
        aiTokensTotal.inc({ ...labels, token_type: 'total' }, totalTokens);
    }
}

export default function notes(config: Config, botId: number) {
    const bot = new Composer<SlushaContext>();

    // if bot was used in last 3 days
    bot.on('message', (ctx, next) => {
        async function handleNotes() {
            const effectiveConfig = await ctx.m.getEffectiveConfig();
            const chatOverride = await ctx.m.getChatConfigOverride();
            const usageSnapshot = await getUsageSnapshot(ctx.memory.db, {
                config: effectiveConfig,
                chatId: ctx.chat.id,
                userId: ctx.from?.id,
                chatOverride,
            });
            if (
                usageSnapshot.downgraded &&
                effectiveConfig.requestWindow.disableNotes
            ) {
                return;
            }
            const frequency = effectiveConfig.ai.notesFrequency;
            const chat = await ctx.m.getChat();
            const history = await ctx.m.getRecentHistory(frequency);

            if (
                chat.lastUse <
                    Date.now() -
                        effectiveConfig.chatLastUseNotes * 24 * 60 * 60 * 1000
            ) {
                return;
            }

            if (history.length < effectiveConfig.ai.notesFrequency / 2) {
                return;
            }

            if (
                chat.lastNotes &&
                ctx.msg.message_id - chat.lastNotes < frequency
            ) {
                return;
            }

            // Set last notes to prevent retries
            await ctx.m.setLastNotesMessageId(ctx.msg.message_id);

            const characterName = chat.character?.name;

            let context: ModelMessage[] = [];
            try {
                context = await makeNotesHistory(
                    { token: config.botToken, id: botId },
                    ctx.api,
                    logger,
                    history,
                    {
                        messagesLimit: frequency,
                        symbolLimit: effectiveConfig.ai.messageMaxLength / 3,
                        bytesLimit: effectiveConfig.ai.bytesLimit,
                        characterName,
                    },
                );
            } catch (error) {
                logger.error('Could not get history: ', error);
                return;
            }

            const model = effectiveConfig.ai.notesModel ??
                effectiveConfig.ai.model;
            const prompt = effectiveConfig.ai.notesPrompt;

            const messages: ModelMessage[] = [
                {
                    role: 'system',
                    content: prompt,
                },
                ...context,
                {
                    role: 'user',
                    content: effectiveConfig.ai.notesPrompt,
                },
            ];

            const start = Date.now();

            const tags = ['notes'];
            if (ctx.chat.type === 'private') {
                tags.push('private');
            }
            const chatName = ctx.chat.first_name ?? ctx.chat.title;

            let response;
            try {
                const generationPolicy = resolveGenerationPolicy({
                    modelRef: model,
                    config: effectiveConfig.ai,
                    task: 'notes',
                    expectsStructuredOutput: false,
                });
                const labels = {
                    task: generationPolicy.telemetry.task,
                    provider: generationPolicy.telemetry.provider,
                    model_ref: generationPolicy.telemetry.modelRef,
                    reply_method: 'notes',
                    downgraded: usageSnapshot.downgraded ? 'true' : 'false',
                };
                const providerOptions = generationPolicy
                    .providerOptions as Parameters<
                        typeof generateText
                    >[0]['providerOptions'];
                aiRequestsTotal.inc(labels);
                const startedAt = performance.now();
                try {
                    response = await generateText({
                        model: generationPolicy.model,
                        providerOptions,
                        messages,
                        temperature: effectiveConfig.ai.temperature,
                        topK: effectiveConfig.ai.topK,
                        topP: effectiveConfig.ai.topP,
                        maxOutputTokens: generationPolicy.maxOutputTokens,
                        experimental_telemetry: {
                            isEnabled: true,
                            functionId: 'generate-notes',
                            metadata: buildGenerationTelemetryMetadata({
                                sessionId: ctx.chat.id.toString(),
                                userId: ctx.chat.type === 'private'
                                    ? ctx.from?.id.toString()
                                    : '',
                                chatName,
                                tags,
                                temperature: effectiveConfig.ai.temperature,
                                topK: effectiveConfig.ai.topK,
                                topP: effectiveConfig.ai.topP,
                                policy: generationPolicy,
                            }),
                        },
                    });
                } catch (error) {
                    aiFailuresTotal.inc({
                        ...labels,
                        error_type: errorType(error),
                    });
                    throw error;
                } finally {
                    aiRequestDurationSeconds.observe(
                        labels,
                        (performance.now() - startedAt) / 1000,
                    );
                }
                aiFinishReasonTotal.inc({
                    ...labels,
                    finish_reason: response.finishReason,
                });
                observeTokenUsage({
                    task: generationPolicy.telemetry.task,
                    provider: generationPolicy.telemetry.provider,
                    model_ref: generationPolicy.telemetry.modelRef,
                }, response.totalUsage);
            } catch (error) {
                logger.error('Could not get summary: ', error);
                return;
            }

            logger.info(
                `Time to generate notes in chat ${chatName}:`,
                (Date.now() - start) / 1000,
            );

            let summaryText = response.text;

            const summarySplit = summaryText.split('\n');

            summaryText = summarySplit
                .map((s) => {
                    let t = s.trim();

                    // Replace lists with bullets
                    if (t.startsWith('* ')) {
                        t = t.slice(1);
                        t = '- ' + t.trim();
                    }

                    return t;
                })
                .join('\n');

            await ctx.m.addNote(summaryText);
            await ctx.m.removeOldNotes(effectiveConfig.maxNotesToStore);
        }

        (async () => {
            try {
                await handleNotes();
            } catch (error) {
                logger.error('Could not handle notes: ', error);
            }
        })();

        return next();
    });

    bot.on('message', (ctx, next) => {
        async function handleMemory() {
            const effectiveConfig = await ctx.m.getEffectiveConfig();
            const chatOverride = await ctx.m.getChatConfigOverride();
            const usageSnapshot = await getUsageSnapshot(ctx.memory.db, {
                config: effectiveConfig,
                chatId: ctx.chat.id,
                userId: ctx.from?.id,
                chatOverride,
            });
            if (
                usageSnapshot.downgraded &&
                effectiveConfig.requestWindow.disableMemory
            ) {
                return;
            }
            const frequency = effectiveConfig.ai.memoryFrequency;
            const chat = await ctx.m.getChat();
            const history = await ctx.m.getRecentHistory(frequency);

            if (
                chat.lastUse <
                    Date.now() -
                        effectiveConfig.chatLastUseNotes * 24 * 60 * 60 * 1000
            ) {
                return;
            }

            if (history.length < effectiveConfig.ai.memoryFrequency / 2) {
                return;
            }

            if (
                chat.lastMemory &&
                ctx.msg.message_id - chat.lastMemory < frequency
            ) {
                return;
            }

            // Set last memory to prevent retries
            await ctx.m.setLastMemoryMessageId(ctx.msg.message_id);

            const characterName = chat.character?.name;
            const savedHistory = history;

            let context: ModelMessage[] = [];
            try {
                context = await makeNotesHistory(
                    { token: config.botToken, id: botId },
                    ctx.api,
                    logger,
                    savedHistory,
                    {
                        messagesLimit: frequency,
                        symbolLimit: effectiveConfig.ai.messageMaxLength / 3,
                        bytesLimit: effectiveConfig.ai.bytesLimit,
                        characterName,
                    },
                );
            } catch (error) {
                logger.error('Could not get history: ', error);
                return;
            }

            let prompt = ''; // Intentionaly no pre-prompt here

            const isComments = isTelegramCommentsHistory(savedHistory);
            prompt += buildChatPromptAddition({
                chatType: ctx.chat.type,
                isComments,
                privateChatPromptAddition:
                    effectiveConfig.ai.privateChatPromptAddition,
                commentsPromptAddition:
                    effectiveConfig.ai.commentsPromptAddition,
                groupChatPromptAddition:
                    effectiveConfig.ai.groupChatPromptAddition,
            });

            prompt += '\n\n';

            const character = chat.character;
            if (character) {
                prompt += '### Character ###\n' + character.description;
            } else {
                prompt += effectiveConfig.ai.prompt;
            }

            const activeMembers = ctx.chat.type === 'private'
                ? []
                : await ctx.m.getActiveMembers();
            const chatInfoMsg = buildChatInfoBlock({
                nowText: new Date().toLocaleString(),
                chatType: ctx.chat.type,
                chatTitle: ctx.chat.title,
                userFirstName: ctx.from.first_name,
                userUsername: ctx.from.username,
                activeMembers,
            });

            prompt += '\n\n' + chatInfoMsg;

            let memPrompt = effectiveConfig.ai.memoryPrompt;
            if (chat.memory) {
                memPrompt += '\n\n' +
                    effectiveConfig.ai.memoryPromptRepeat +
                    '\n' +
                    chat.memory;
            }

            prompt += '\n\n' + effectiveConfig.ai.memoryPrompt;

            const model = effectiveConfig.ai.memoryModel ??
                effectiveConfig.ai.model;

            const messages: ModelMessage[] = [
                {
                    role: 'system',
                    content: prompt,
                },
                ...context,
                {
                    role: 'user',
                    content: memPrompt,
                },
            ];

            // logger.info('generating memory', messages);

            const start = Date.now();

            const tags = ['memory'];
            if (ctx.chat.type === 'private') {
                tags.push('private');
            }
            const chatName = ctx.chat.first_name ?? ctx.chat.title;

            let response;
            try {
                const generationPolicy = resolveGenerationPolicy({
                    modelRef: model,
                    config: effectiveConfig.ai,
                    task: 'memory',
                    expectsStructuredOutput: false,
                });
                const labels = {
                    task: generationPolicy.telemetry.task,
                    provider: generationPolicy.telemetry.provider,
                    model_ref: generationPolicy.telemetry.modelRef,
                    reply_method: 'memory',
                    downgraded: usageSnapshot.downgraded ? 'true' : 'false',
                };
                const providerOptions = generationPolicy
                    .providerOptions as Parameters<
                        typeof generateText
                    >[0]['providerOptions'];
                aiRequestsTotal.inc(labels);
                const startedAt = performance.now();
                try {
                    response = await generateText({
                        model: generationPolicy.model,
                        providerOptions,
                        messages,
                        temperature: effectiveConfig.ai.temperature,
                        topK: effectiveConfig.ai.topK,
                        topP: effectiveConfig.ai.topP,
                        maxOutputTokens: generationPolicy.maxOutputTokens,
                        experimental_telemetry: {
                            isEnabled: true,
                            functionId: 'generate-memory',
                            metadata: buildGenerationTelemetryMetadata({
                                sessionId: ctx.chat.id.toString(),
                                userId: ctx.chat.type === 'private'
                                    ? ctx.from?.id.toString()
                                    : '',
                                chatName,
                                tags,
                                temperature: effectiveConfig.ai.temperature,
                                topK: effectiveConfig.ai.topK,
                                topP: effectiveConfig.ai.topP,
                                policy: generationPolicy,
                            }),
                        },
                    });
                } catch (error) {
                    aiFailuresTotal.inc({
                        ...labels,
                        error_type: errorType(error),
                    });
                    throw error;
                } finally {
                    aiRequestDurationSeconds.observe(
                        labels,
                        (performance.now() - startedAt) / 1000,
                    );
                }
                aiFinishReasonTotal.inc({
                    ...labels,
                    finish_reason: response.finishReason,
                });
                observeTokenUsage({
                    task: generationPolicy.telemetry.task,
                    provider: generationPolicy.telemetry.provider,
                    model_ref: generationPolicy.telemetry.modelRef,
                }, response.totalUsage);
            } catch (error) {
                logger.error('Could not get memory: ', error);
                return;
            }

            logger.info(
                `Time to generate memory in chat ${chatName}:`,
                (Date.now() - start) / 1000,
            );

            // logger.info(`Memory generated: \n${response.text}\n`);

            if (!response.text.trim()) {
                logger.warn('Empty response from AI');
                return;
            }

            await ctx.m.setMemory(response.text);
        }

        (async () => {
            try {
                await handleMemory();
            } catch (error) {
                logger.error('Could not handle notes: ', error);
            }
        })();

        return next();
    });

    return bot;
}
