import { Bot, Composer } from 'grammy';
import { SlushaContext } from '../setup-bot.ts';
import logger from '../../logger.ts';
import { APICallError, type ModelMessage, tool } from 'ai';
import { makeHistory } from '../../history.ts';
import { getRandomNepon, prettyDate } from '../../helpers.ts';
import { replyGeneric, replyWithMarkdownId } from '../helpers.ts';
import type { ChatMessage, ReplyTo } from '../../persistence/types.ts';
import type { UserConfig } from '../../config.ts';
import {
    chatActionsToolInputSchema,
    ChatEntry,
    isReactEntry,
    isTextEntry,
    parseChatEntriesFromUnknown,
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
    buildUserProfileContext,
    isTelegramCommentsHistory,
} from '../../ai/chat-context.ts';
import { canonicalizeReaction, resolveEnabledReactions } from '../reactions.ts';
import { isMissingSendTextRightsError } from '../reply-rights.ts';
import { buildLanguageProtocol } from '../../ai/language-protocol.ts';
import { resolveGenerationPolicy } from '../../ai/generation-policy.ts';
import { generateStructuredOutput } from '../../ai/structured-generation.ts';
import { UserProfileRepository } from '../../persistence/user-profile.ts';

const DEFAULT_CHAT_ACTIONS_TOOL_DESCRIPTION =
    'Submit Telegram actions once per turn. Return entries where each item is either {"type":"reply","text":"...","target_ref":"tN"} or {"type":"react","react":"❤","target_ref":"tN"}. Use target_ref values from Reply Target Map. If target_ref is omitted, action applies to the triggering message.';

const reservedMessageTokens = ['slusha_meta', 'target_ref'];
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

function hasReservedMessageToken(entries: ChatEntry[]): boolean {
    return entries.some((entry) => {
        if (!isTextEntry(entry) || typeof entry.text !== 'string') {
            return false;
        }

        const text = entry.text.toLowerCase();
        return reservedMessageTokens.some((token) => text.includes(token));
    });
}

function isReservedMessageTokenError(error: unknown): boolean {
    return error instanceof Error &&
        error.message === RESERVED_MESSAGE_TOKEN_ERROR;
}

type EffectiveConfig = UserConfig;

async function sendGeneratedOutput(params: {
    bot: Bot<SlushaContext>;
    ctx: SlushaContext;
    output: ChatEntry[];
    targetRefMap: Map<string, number>;
    enabledReactions: string[];
    effectiveConfig: EffectiveConfig;
    historyById: Map<number, ChatMessage>;
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
    let chatTopicId: number | undefined;
    if (typeof ctx.msg?.message_thread_id === 'number') {
        chatTopicId = ctx.msg.message_thread_id;
    }

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
                        await ctx.messages.applyReactionDelta(
                            targetId,
                            {
                                emojiAdded: [canon],
                                emojiRemoved: [],
                                customAdded: [],
                                customRemoved: [],
                            },
                            {
                                id: bot.botInfo.id,
                                username: bot.botInfo.username,
                                first_name: bot.botInfo.first_name ?? 'Slusha',
                            },
                        );
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

        let explicitTargetRef: string | undefined;
        if (
            typeof res.target_ref === 'string' &&
            res.target_ref.trim().length > 0
        ) {
            explicitTargetRef = res.target_ref.trim();
        }
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
            let targetInSameTopic: boolean;
            if (targetMsg) {
                targetInSameTopic = targetTopicId === chatTopicId;
            } else {
                targetInSameTopic = msgToReply === ctx.msg?.message_id;
            }
            if (!targetInSameTopic) {
                msgToReply = undefined;
            }
        }

        let replyOther: { message_thread_id: number } | undefined;
        if (typeof chatTopicId === 'number') {
            replyOther = { message_thread_id: chatTopicId };
        }

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
                await ctx.chatConfig.disableRepliesDueToRights();
                await ctx.chatConfig.setDisabledReplyRightsLastProbeAt(
                    Date.now(),
                );
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
                if (parent.threadId) {
                    threadId = parent.threadId;
                } else if (typeof parent.threadRootMessageId === 'number') {
                    threadId = `thread:${parent.threadRootMessageId}`;
                } else {
                    threadId = `thread:${threadParentMessageId}`;
                }
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
        await ctx.messages.addMessage(messageRecord);
        historyById.set(messageRecord.id, messageRecord);

        if (i === output.length - 1) {
            break;
        }

        const typingSpeed = 1200; // symbol per minute
        const next = output[i + 1];
        let nextLen = 0;
        if (next && isTextEntry(next) && typeof next.text === 'string') {
            nextLen = next.text.length;
        }
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
        const chatState = await ctx.chats.getChat(ctx.chat);
        const effectiveConfig = await ctx.chatConfig.getEffectiveConfig();
        const sendChatActionsTool = createSendChatActionsTool(
            resolveCustomPrompt(
                effectiveConfig.ai.chatActionsToolDescription,
                DEFAULT_CHAT_ACTIONS_TOOL_DESCRIPTION,
            ),
        );
        const enabledReactions = resolveEnabledReactions(
            effectiveConfig.blacklistedReactions,
        );
        const messagesToPass = effectiveConfig.ai.messagesToPass;
        const bytesLimit = effectiveConfig.ai.bytesLimit;
        const maxTargetCount = Math.min(
            Math.max(messagesToPass * 2, 12),
            40,
        );
        const attempts = getGenerationFallbackPlans(messagesToPass);
        const maxAttemptHistoryLimit = attempts.reduce(
            (maxLimit, attempt) => Math.max(maxLimit, attempt.historyLimit),
            0,
        );
        const savedHistory = await ctx.messages.getRecentHistory(
            Math.max(maxTargetCount, maxAttemptHistoryLimit),
        );

        let activeMessageThreadId: number | undefined;
        if (typeof ctx.msg.message_thread_id === 'number') {
            activeMessageThreadId = ctx.msg.message_thread_id;
        }
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
        let profileAbout: string | undefined;
        if (ctx.from) {
            const userProfile = await new UserProfileRepository(
                ctx.db,
                ctx.from.id,
            ).getProfile();
            profileAbout = userProfile.about;
        }

        const modelRef = effectiveConfig.ai.model;

        const time = new Date().getTime();
        const maxGenerationRetries = 2;

        const tags = ['user-message'];
        if (ctx.chat.type === 'private') {
            tags.push('private');
        }
        if (ctx.info.isRandom) {
            tags.push('random');
        }
        const chatName = ctx.chat.first_name ?? ctx.chat.title;

        let activeMembers: Awaited<
            ReturnType<typeof ctx.members.getActiveMembers>
        > = [];
        if (ctx.chat.type !== 'private') {
            activeMembers = await ctx.members.getActiveMembers();
        }

        let generationPolicy: ReturnType<typeof resolveGenerationPolicy>;
        try {
            generationPolicy = resolveGenerationPolicy({
                modelRef,
                config: effectiveConfig.ai,
                openrouterApiKey: ctx.info.openrouterApiKey,
                opencodeToken: ctx.info.opencodeToken,
                task: 'chat',
                expectsStructuredOutput: true,
            });
        } catch (error) {
            logger.error('Could not resolve generation policy', error);
            if (!ctx.info.isRandom) {
                await ctx.reply(getRandomNepon(effectiveConfig));
            }
            return;
        }

        const buildGenerationInputForAttempt = async (
            plan: GenerationAttemptPlan,
        ): Promise<{ instructions: string; messages: ModelMessage[] }> => {
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

            const includeBinaryAttachments =
                effectiveConfig.ai.includeAttachmentsInHistory &&
                generationPolicy.capabilities.binaryHistoryAttachments;

            const history = await makeHistory(
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
                    attachments: includeBinaryAttachments,
                },
            );

            const annotatedHistory = annotateHistoryWithTargetRefs(
                history,
                targetRefs,
            );
            messages.push(...annotatedHistory);

            const profileContext = buildUserProfileContext(profileAbout);
            if (profileContext) {
                messages.push(profileContext);
            }

            const finalPrompt = effectiveConfig.ai.finalPrompt +
                ' Return only actions array using typed entries and target_ref values from Reply Target Map.';

            messages.push({
                role: 'user',
                content: finalPrompt,
            });

            return {
                instructions: prompt,
                messages,
            };
        };

        let output: ChatEntry[] | undefined;
        let generationError: unknown;

        for (const attempt of attempts) {
            let generationInput: {
                instructions: string;
                messages: ModelMessage[];
            };
            try {
                generationInput = await buildGenerationInputForAttempt(attempt);
            } catch (error) {
                generationError = error;
                logger.warn('Could not get history for generation attempt', {
                    level: attempt.level,
                    historyLimit: attempt.historyLimit,
                    error,
                });
                continue;
            }

            try {
                const generatedOutput = await generateStructuredOutput({
                    policy: generationPolicy,
                    prompt: {
                        kind: 'messages',
                        instructions: generationInput.instructions,
                        messages: generationInput.messages,
                    },
                    temperature: effectiveConfig.ai.temperature,
                    topK: effectiveConfig.ai.topK,
                    topP: effectiveConfig.ai.topP,
                    maxRetries: maxGenerationRetries,
                    tool: {
                        definition: sendChatActionsTool,
                        name: 'send_chat_actions',
                        parse: (value) => {
                            const parsed = chatActionsToolInputSchema.safeParse(
                                value,
                            );
                            if (parsed.success) {
                                return parsed.data.entries;
                            }
                            return undefined;
                        },
                    },
                    json: {
                        instruction:
                            'Return only a valid JSON array of actions. Do not use markdown fences or prose.',
                        parse: (value) => {
                            const entries = parseChatEntriesFromUnknown(value);
                            if (entries) {
                                return entries;
                            }
                            return undefined;
                        },
                    },
                    telemetry: {
                        toolFunctionId: 'user-message',
                        jsonFunctionId: 'user-message-opencode-json-fallback',
                    },
                });
                if (hasReservedMessageToken(generatedOutput)) {
                    throw new Error(RESERVED_MESSAGE_TOKEN_ERROR);
                }
                output = generatedOutput;
                break;
            } catch (error) {
                generationError = error;
                logger.warn('Generation attempt failed', {
                    level: attempt.level,
                    historyLimit: attempt.historyLimit,
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

            let blockedByProviderMessage =
                'API провайдер запрещает тебе отвечать: ';
            if (character) {
                blockedByProviderMessage =
                    'API провайдер запрещает тебе отвечать. Возможно это из-за персонажа: ';
            }

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
        let username = '';
        if (ctx.chat?.username) {
            username = `(@${ctx.chat.username})`;
        }
        let randomMessageSuffix = '';
        if (ctx.info.isRandom) {
            randomMessageSuffix = '(random)';
        }

        logger.info(
            `Time to get response ${randomMessageSuffix}:`,
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
