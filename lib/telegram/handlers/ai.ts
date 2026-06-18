import { Bot, Composer } from 'grammy';
import { SlushaContext } from '../setup-bot.ts';
import logger from '../../logger.ts';
import {
    APICallError,
    generateText,
    hasToolCall,
    ModelMessage,
    tool,
} from 'ai';
import { makeHistoryV3 } from '../../history.ts';
import { getRandomNepon, prettyDate } from '../../helpers.ts';
import { replyGeneric, replyWithMarkdownId } from '../helpers.ts';
import { ReplyTo } from '../../memory.ts';
import {
    chatActionsToolInputSchema,
    ChatEntry,
    isReactEntry,
    isTextEntry,
} from '../../ai/schema.ts';
import {
    annotateHistoryWithTargetRefs,
    buildTargetRefs,
    buildTargetRefsPrompt,
} from '../../ai/target-refs.ts';
import {
    type GenerationAttemptPlan,
    getGenerationFallbackPlans,
    resolveCustomPrompt,
} from '../../ai/chat-generation.ts';
import {
    buildChatInfoBlock,
    buildChatPromptAddition,
    isTelegramCommentsHistory,
} from '../../ai/chat-context.ts';
import { canonicalizeReaction, resolveEnabledReactions } from '../reactions.ts';
import { isMissingSendTextRightsError } from '../reply-rights.ts';
import { resolveGenerationPolicy } from '../../ai/generation-policy.ts';
import { parseModelRef } from '../../ai/model-ref.ts';
import { buildGenerationTelemetryMetadata } from '../../ai/telemetry-metadata.ts';
import { buildLanguageProtocol } from '../../ai/language-protocol.ts';
import {
    cleanupUsageEvents,
    getUsageSnapshot,
    recordUsageEvent,
} from '../usage-window.ts';

const DEFAULT_CHAT_ACTIONS_TOOL_DESCRIPTION =
    'Submit Telegram actions once per turn. Return entries where each item is either {"type":"reply","text":"...","target_ref":"tN"} or {"type":"react","react":"❤","target_ref":"tN"}. Use target_ref values from Reply Target Map. If target_ref is omitted, action applies to the triggering message.';

const defaultReservedMessageTokens = [
    'slusha_meta',
    'target_ref',
];
const RESERVED_MESSAGE_TOKEN_ERROR =
    'Generated output contains reserved metadata token';

function createSendChatActionsTool(description: string) {
    return tool({
        description,
        inputSchema: chatActionsToolInputSchema,
        inputExamples: [
            {
                input: {
                    entries: [
                        {
                            type: 'reply',
                            text: 'first *message* `code`',
                            target_ref: 't0',
                        },
                        {
                            type: 'reply',
                            text: 'second short message',
                            target_ref: 't0',
                        },
                        {
                            type: 'react',
                            react: '❤',
                            target_ref: 't0',
                        },
                    ],
                },
            },
            {
                input: {
                    entries: [
                        {
                            type: 'react',
                            react: '❤',
                            target_ref: 't1',
                        },
                    ],
                },
            },
            {
                input: {
                    entries: [
                        {
                            type: 'reply',
                            text: 'lorem ipsum',
                            target_ref: 't0',
                        },
                    ],
                },
            },
            {
                input: {
                    entries: [
                        {
                            type: 'reply',
                            text: '',
                        },
                    ],
                },
            },
            {
                input: {
                    entries: [
                        {
                            type: 'reply',
                            text:
                                'just a text message with no reactions which is preferred for most cases',
                            target_ref: 't0',
                        },
                    ],
                },
            },
        ],
    });
}

function parseSendChatActionsEntries(
    toolCalls: Array<{ toolName: string; input: unknown }>,
): ChatEntry[] | undefined {
    const chatActionsToolCall = toolCalls.find((call) =>
        call.toolName === 'send_chat_actions'
    );
    const parsedToolCallInput = chatActionsToolCall
        ? chatActionsToolInputSchema.safeParse(
            chatActionsToolCall.input,
        )
        : undefined;

    if (parsedToolCallInput?.success) {
        return parsedToolCallInput.data.entries;
    }

    return undefined;
}

function normalizeReservedMessageTokens(rawTokens: string[]): string[] {
    const normalized = Array.from(
        new Set(
            rawTokens
                .map((token) => token.trim().toLowerCase())
                .filter((token) => token.length > 0),
        ),
    );
    return normalized.length > 0 ? normalized : defaultReservedMessageTokens;
}

function hasReservedMessageToken(
    entries: ChatEntry[],
    reservedTokens: string[],
): boolean {
    return entries.some((entry) => {
        if (!isTextEntry(entry) || typeof entry.text !== 'string') {
            return false;
        }

        const text = entry.text.toLowerCase();
        return reservedTokens.some((token) => text.includes(token));
    });
}

function isReservedMessageTokenError(error: unknown): boolean {
    return error instanceof Error &&
        error.message === RESERVED_MESSAGE_TOKEN_ERROR;
}

function buildTelemetryMetadata(
    ctx: SlushaContext,
    chatName: string,
    tags: string[],
    effectiveConfig: Awaited<
        ReturnType<SlushaContext['m']['getEffectiveConfig']>
    >,
    policy: ReturnType<typeof resolveGenerationPolicy>,
) {
    return buildGenerationTelemetryMetadata({
        sessionId: ctx.chat?.id.toString() ?? '',
        userId: ctx.from?.id.toString() ?? '',
        chatName,
        tags,
        temperature: effectiveConfig.ai.temperature,
        topK: effectiveConfig.ai.topK,
        topP: effectiveConfig.ai.topP,
        policy,
    });
}

type EffectiveConfig = Awaited<
    ReturnType<SlushaContext['m']['getEffectiveConfig']>
>;

async function sendGeneratedOutput(params: {
    bot: Bot<SlushaContext>;
    ctx: SlushaContext;
    output: ChatEntry[];
    targetRefMap: Map<string, number>;
    enabledReactions: string[];
    effectiveConfig: EffectiveConfig;
    historyById: Map<
        number,
        Awaited<ReturnType<SlushaContext['m']['getHistory']>>[number]
    >;
}): Promise<boolean> {
    const {
        bot,
        ctx,
        output,
        targetRefMap,
        enabledReactions,
        effectiveConfig,
        historyById,
    } = params;
    const chatTopicId = typeof ctx.msg?.message_thread_id === 'number'
        ? ctx.msg.message_thread_id
        : undefined;

    function resolveTargetMessageId(targetRef?: string): number | undefined {
        if (targetRef) {
            const fromMap = targetRefMap.get(targetRef);
            if (fromMap) {
                return fromMap;
            }

            logger.debug(
                'Unknown target_ref, fallback to trigger message',
                {
                    targetRef,
                },
            );
        }

        return ctx.msg?.message_id;
    }

    let lastMsgId: number | undefined = undefined;
    for (let i = 0; i < output.length; i++) {
        const res = output[i];
        if (
            isReactEntry(res) && typeof res.react === 'string' &&
            res.react.trim().length > 0
        ) {
            const canon = canonicalizeReaction(res.react.trim());
            if (canon && enabledReactions.includes(canon)) {
                const targetId = resolveTargetMessageId(res.target_ref);
                if (targetId) {
                    try {
                        const chatId = ctx.chat?.id;
                        if (!chatId) {
                            logger.debug(
                                'Reaction chat context missing, skipping',
                            );
                            continue;
                        }
                        await ctx.api.setMessageReaction(
                            chatId,
                            targetId,
                            [{ type: 'emoji', emoji: canon }],
                        );
                        await ctx.m.addEmojiReaction(targetId, canon, {
                            id: bot.botInfo.id,
                            username: bot.botInfo.username,
                            first_name: bot.botInfo.first_name ?? 'Slusha',
                        });
                    } catch (error) {
                        logger.warn('Could not set reaction: ', error);
                    }
                } else {
                    logger.debug('Reaction target not found, skipping');
                }
            } else {
                logger.debug(
                    'Reaction blocked or not allowed, dropping: ' +
                        res.react,
                );
            }
        }

        if (!isTextEntry(res)) {
            continue;
        }

        let replyText = (res.text ?? '').trim();
        if (replyText.length === 0) {
            logger.info('Empty response from AI');
            continue;
        }

        if (replyText.startsWith('* ')) {
            replyText = replyText.slice(1);
            replyText = '-' + replyText;
        }

        const explicitTargetRef = typeof res.target_ref === 'string' &&
                res.target_ref.trim().length > 0
            ? res.target_ref.trim()
            : undefined;
        let msgToReply: number | undefined;
        if (explicitTargetRef) {
            msgToReply = resolveTargetMessageId(explicitTargetRef);
        } else if (lastMsgId) {
            msgToReply = lastMsgId;
        } else {
            msgToReply = ctx.msg?.message_id;
        }

        if (typeof chatTopicId === 'number' && typeof msgToReply === 'number') {
            const targetMsg = historyById.get(msgToReply);
            const targetTopicId = targetMsg?.info.message_thread_id;
            const targetInSameTopic = targetMsg
                ? targetTopicId === chatTopicId
                : msgToReply === ctx.msg?.message_id;
            if (!targetInSameTopic) {
                msgToReply = undefined;
            }
        }

        const replyOther = typeof chatTopicId === 'number'
            ? { message_thread_id: chatTopicId }
            : undefined;

        let replyInfo;
        try {
            if (ctx.chat?.type === 'private') {
                replyInfo = await replyGeneric(
                    ctx,
                    replyText,
                    false,
                    'Markdown',
                );
            } else {
                replyInfo = await replyWithMarkdownId(
                    ctx,
                    replyText,
                    msgToReply,
                    replyOther,
                );
            }
        } catch (error) {
            if (
                ctx.chat?.type !== 'private' &&
                isMissingSendTextRightsError(error)
            ) {
                await ctx.m.setDisableRepliesDueToRights(true);
                await ctx.m.setDisabledReplyRightsLastProbeAt(Date.now());
                logger.warn(
                    'Disabled replies in chat due to missing send rights',
                );
                return false;
            }

            logger.error('Could not reply to user: ', error);
            if (!ctx.info.isRandom) {
                await ctx.reply(getRandomNepon(effectiveConfig));
            }
            return false;
        }

        lastMsgId = replyInfo.message_id;

        let replyTo: ReplyTo | undefined;
        let threadId: string | undefined;
        let threadRootMessageId: number | undefined;
        let threadParentMessageId: number | undefined;
        let threadSource = 'bot_new';
        if (replyInfo.reply_to_message) {
            threadParentMessageId = replyInfo.reply_to_message.message_id;
            const parent = historyById.get(threadParentMessageId);
            if (parent) {
                threadId = parent.threadId ??
                    (typeof parent.threadRootMessageId === 'number'
                        ? `thread:${parent.threadRootMessageId}`
                        : `thread:${threadParentMessageId}`);
                threadRootMessageId = parent.threadRootMessageId ?? parent.id;
                threadSource = 'bot_parent';
            } else {
                threadId = `thread:${threadParentMessageId}`;
                threadRootMessageId = threadParentMessageId;
                threadSource = 'bot_parent_external';
            }

            replyTo = {
                id: threadParentMessageId,
                text: replyInfo.reply_to_message.text ??
                    replyInfo.reply_to_message.caption ?? '',
                isMyself: false,
                info: replyInfo.reply_to_message,
            };
        } else {
            threadId = `thread:${replyInfo.message_id}`;
            threadRootMessageId = replyInfo.message_id;
        }

        const messageRecord = {
            id: replyInfo.message_id,
            text: replyText,
            isMyself: true,
            info: replyInfo,
            replyTo,
            threadId,
            threadRootMessageId,
            threadParentMessageId,
            threadSource,
        };
        await ctx.m.addMessage(messageRecord);
        historyById.set(messageRecord.id, messageRecord);

        if (i === output.length - 1) {
            break;
        }

        const typingSpeed = 1200; // symbol per minute
        const next = output[i + 1];
        const nextLen =
            next && isTextEntry(next) && typeof next.text === 'string'
                ? next.text.length
                : 0;
        let msToWait = nextLen / typingSpeed * 60 * 1000;
        if (msToWait > 5000) {
            msToWait = 5000;
        }
        await new Promise((resolve) => setTimeout(resolve, msToWait));
    }

    return true;
}

export function createAIMiddleware(bot: Bot<SlushaContext>) {
    const composer = new Composer<SlushaContext>();

    composer.on('message', async (ctx) => {
        const chatState = await ctx.m.getChat();
        const effectiveConfig = await ctx.m.getEffectiveConfig();
        const chatOverride = await ctx.m.getChatConfigOverride();
        await recordUsageEvent(ctx.memory.db, {
            chatId: ctx.chat.id,
            userId: ctx.from?.id,
        });
        await cleanupUsageEvents(ctx.memory.db, effectiveConfig);
        const usageSnapshot = await getUsageSnapshot(ctx.memory.db, {
            config: effectiveConfig,
            chatId: ctx.chat.id,
            userId: ctx.from?.id,
            chatOverride,
        });
        const usageConfig = effectiveConfig.requestWindow;
        const isDowngraded = usageSnapshot.downgraded;
        const includeNotes = !isDowngraded || !usageConfig.disableNotes;
        const includeMemory = !isDowngraded || !usageConfig.disableMemory;
        const includeAttachments = !isDowngraded ||
            !usageConfig.disableAttachments;
        const sendChatActionsTool = createSendChatActionsTool(
            resolveCustomPrompt(
                effectiveConfig.ai.chatActionsToolDescription,
                DEFAULT_CHAT_ACTIONS_TOOL_DESCRIPTION,
            ),
        );
        const enabledReactions = resolveEnabledReactions(
            effectiveConfig.blacklistedReactions,
        );
        const reservedMessageTokens = normalizeReservedMessageTokens(
            effectiveConfig.ai.reservedMessageTokens,
        );

        const baseMessagesToPass = chatState.messagesToPass ??
            effectiveConfig.ai.messagesToPass;
        const messagesToPass = isDowngraded && usageConfig.disableLongContext
            ? Math.min(baseMessagesToPass, usageConfig.downgradeMessagesToPass)
            : baseMessagesToPass;
        const bytesLimit = isDowngraded && usageConfig.disableLongContext
            ? Math.min(
                effectiveConfig.ai.bytesLimit,
                usageConfig.downgradeBytesLimit,
            )
            : effectiveConfig.ai.bytesLimit;
        const maxTargetCount = Math.min(
            Math.max(messagesToPass * 2, 12),
            40,
        );
        const attempts = getGenerationFallbackPlans(messagesToPass);
        const maxAttemptHistoryLimit = attempts.reduce(
            (maxLimit, attempt) => Math.max(maxLimit, attempt.historyLimit),
            0,
        );
        const savedHistory = await ctx.m.getRecentHistory(
            Math.max(maxTargetCount, maxAttemptHistoryLimit),
        );

        const activeMessageThreadId = typeof ctx.msg.message_thread_id ===
                'number'
            ? ctx.msg.message_thread_id
            : undefined;
        const targetRefs = buildTargetRefs(savedHistory, maxTargetCount, {
            activeMessageThreadId,
        });
        const targetRefMap = new Map(
            targetRefs.map((target) => [target.ref, target.messageId]),
        );

        const isComments = isTelegramCommentsHistory(savedHistory);
        const currentLocale = chatState.locale ??
            ctx.from?.language_code ??
            await ctx.i18n.getLocale();
        const character = chatState.character;

        const modelRef = isDowngraded
            ? usageConfig.downgradeModel
            : (chatState.chatModel ?? effectiveConfig.ai.model);
        const parsedModel = parseModelRef(modelRef);

        const time = new Date().getTime();
        const maxGenerationRetries = 2;

        const tags = ['user-message'];
        if (ctx.chat.type === 'private') {
            tags.push('private');
        }
        if (ctx.info.isRandom) {
            tags.push('random');
        }
        if (isDowngraded) {
            tags.push('downgraded');
        }
        const chatName = ctx.chat.first_name ?? ctx.chat.title;

        const activeMembers = ctx.chat.type === 'private'
            ? []
            : await ctx.m.getActiveMembers();

        const buildMessagesForAttempt = async (
            plan: GenerationAttemptPlan,
        ): Promise<ModelMessage[]> => {
            const messages: ModelMessage[] = [];

            let prompt = (effectiveConfig.ai.prePrompt ?? '') + '\n\n';

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

            if (chatState.hateMode && effectiveConfig.ai.hateModePrompt) {
                prompt += '\n' + effectiveConfig.ai.hateModePrompt;
            }

            prompt += '\n\n';
            prompt += buildLanguageProtocol(currentLocale) + '\n\n';

            if (character) {
                prompt += '### Character ###\n' + character.description;
            } else {
                prompt += effectiveConfig.ai.prompt;
            }

            const chatInfoMsg = buildChatInfoBlock({
                nowText: prettyDate(),
                chatType: ctx.chat.type,
                chatTitle: ctx.chat.title,
                userFirstName: ctx.from.first_name,
                userUsername: ctx.from.username,
                activeMembers,
                notes: chatState.notes,
                memory: chatState.memory,
                includeNotes: plan.includeBotNotes && includeNotes,
                includeMemory: plan.includeBotNotes && includeMemory,
            });

            prompt += `\n\n### Chat Info ###\n${chatInfoMsg}`;
            if (enabledReactions.length === 0) {
                prompt +=
                    '\n\n### Reactions ###\n- Reactions are disabled for this chat. Do not output react actions.';
            } else {
                prompt +=
                    `\n\n### Reactions ###\n- Allowed reactions for this chat: ${
                        enabledReactions.join(', ')
                    }`;
            }
            prompt += `\n\n${buildTargetRefsPrompt(targetRefs)}`;

            messages.push({
                role: 'system',
                content: prompt,
            });

            const history = await makeHistoryV3(
                { token: bot.token, id: bot.botInfo.id },
                bot.api,
                logger,
                savedHistory,
                {
                    messagesLimit: plan.historyLimit,
                    bytesLimit,
                    symbolLimit: effectiveConfig.ai.messageMaxLength,
                    includeReactions: true,
                    activeMessageId: ctx.msg.message_id,
                    attachments:
                        effectiveConfig.ai.includeAttachmentsInHistory &&
                        includeAttachments &&
                        parsedModel.provider === 'google',
                },
            );

            const annotatedHistory = annotateHistoryWithTargetRefs(
                history,
                targetRefs,
            );
            messages.push(...annotatedHistory);

            const finalPrompt = effectiveConfig.ai.finalPrompt +
                ' Return only actions array using typed entries and target_ref values from Reply Target Map.';

            messages.push({
                role: 'user',
                content: finalPrompt,
            });

            return messages;
        };

        const generateStructuredActionsOutput = async (
            messages: ModelMessage[],
        ): Promise<ChatEntry[]> => {
            const generationPolicy = resolveGenerationPolicy({
                modelRef,
                config: effectiveConfig.ai,
                task: 'chat',
                expectsStructuredOutput: true,
            });
            const providerOptions = generationPolicy
                .providerOptions as Parameters<
                    typeof generateText
                >[0]['providerOptions'];
            const result = await generateText({
                model: generationPolicy.model,
                providerOptions,
                maxRetries: maxGenerationRetries,
                tools: {
                    send_chat_actions: sendChatActionsTool,
                },
                toolChoice: {
                    type: 'tool',
                    toolName: 'send_chat_actions',
                },
                stopWhen: hasToolCall('send_chat_actions'),
                temperature: effectiveConfig.ai.temperature,
                topK: effectiveConfig.ai.topK,
                topP: effectiveConfig.ai.topP,
                maxOutputTokens: generationPolicy.maxOutputTokens,
                messages,
                experimental_telemetry: {
                    isEnabled: true,
                    functionId: 'user-message',
                    metadata: buildTelemetryMetadata(
                        ctx,
                        chatName,
                        tags,
                        effectiveConfig,
                        generationPolicy,
                    ),
                },
            });

            const entries = parseSendChatActionsEntries(result.toolCalls);
            if (entries) {
                return entries;
            } else {
                logger.warn(
                    'Structured tool call missing or invalid after retries',
                    {
                        modelRef,
                        chatId: ctx.chat.id,
                        finishReason: result.finishReason,
                        toolCalls: result.toolCalls.map((call) =>
                            call.toolName
                        ),
                        usage: result.totalUsage,
                    },
                );
                throw new Error(
                    'Structured tool call missing or invalid after retries',
                );
            }
        };

        let output: ChatEntry[] | undefined;
        let generationError: unknown;

        for (const attempt of attempts) {
            let attemptMessages: ModelMessage[];
            try {
                attemptMessages = await buildMessagesForAttempt(attempt);
            } catch (error) {
                generationError = error;
                logger.warn('Could not get history for generation attempt', {
                    level: attempt.level,
                    historyLimit: attempt.historyLimit,
                    includeBotNotes: attempt.includeBotNotes,
                    error,
                });
                continue;
            }

            try {
                const generatedOutput = await generateStructuredActionsOutput(
                    attemptMessages,
                );
                if (
                    hasReservedMessageToken(
                        generatedOutput,
                        reservedMessageTokens,
                    )
                ) {
                    throw new Error(RESERVED_MESSAGE_TOKEN_ERROR);
                }
                output = generatedOutput;
                break;
            } catch (error) {
                generationError = error;
                logger.warn('Generation attempt failed', {
                    level: attempt.level,
                    historyLimit: attempt.historyLimit,
                    includeBotNotes: attempt.includeBotNotes,
                    reservedMessageToken: isReservedMessageTokenError(error),
                    error,
                });
            }
        }

        if (!output) {
            if (isReservedMessageTokenError(generationError)) {
                logger.warn(
                    'Could not get response: generated output included reserved metadata tokens',
                );
                return;
            }

            let blockReason: string | undefined;
            if (
                generationError instanceof APICallError &&
                generationError.responseBody
            ) {
                try {
                    const parsedError = JSON.parse(
                        generationError.responseBody,
                    );
                    if (
                        typeof parsedError?.promptFeedback?.blockReason ===
                            'string'
                    ) {
                        blockReason = parsedError.promptFeedback.blockReason;
                    }
                } catch {
                    blockReason = undefined;
                }
            }

            const blockedByProviderMessage = character
                ? 'API провайдер запрещает тебе отвечать. Возможно это из-за персонажа: '
                : 'API провайдер запрещает тебе отвечать: ';

            if (blockReason === 'PROHIBITED_CONTENT') {
                logger.warn(
                    'Could not get response: blocked by provider (PROHIBITED_CONTENT)',
                );
                return ctx.reply(
                    blockedByProviderMessage +
                        blockReason,
                );
            }

            logger.error('Could not get response: ', generationError);
            if (blockReason) {
                return ctx.reply(
                    blockedByProviderMessage +
                        blockReason,
                );
            }
            if (!ctx.info.isRandom) {
                await ctx.reply(getRandomNepon(effectiveConfig));
            }
            return;
        }

        const name = chatName;
        const username = ctx.chat?.username ? `(@${ctx.chat.username})` : '';

        logger.info(
            `Time to get response ${ctx.info.isRandom ? '(random)' : ''}:`,
            (new Date().getTime() - time) / 1000,
            `for "${name}" ${username}. `,
        );

        const historyById = new Map(savedHistory.map((msg) => [msg.id, msg]));

        await sendGeneratedOutput({
            bot,
            ctx,
            output,
            targetRefMap,
            enabledReactions,
            effectiveConfig,
            historyById,
        });
    });

    return composer;
}

export default function registerAI(bot: Bot<SlushaContext>) {
    bot.use(createAIMiddleware(bot));
}
