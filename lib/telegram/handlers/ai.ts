import { Bot } from 'grammy';
import { SlushaContext } from '../setup-bot.ts';
import logger from '../../logger.ts';
import {
    APICallError,
    generateText,
    hasToolCall,
    ModelMessage,
    tool,
} from 'ai';
import { makeHistoryV2 } from '../../history.ts';
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
import { canonicalizeReaction, resolveEnabledReactions } from '../reactions.ts';
import { isMissingSendTextRightsError } from '../reply-rights.ts';
import { resolveGenerationPolicy } from '../../ai/generation-policy.ts';
import { parseModelRef } from '../../ai/model-ref.ts';
import { buildGenerationTelemetryMetadata } from '../../ai/telemetry-metadata.ts';
import { buildLanguageProtocol } from '../../ai/language-protocol.ts';

export default function registerAI(bot: Bot<SlushaContext>) {
    const sendChatActionsTool = tool({
        description:
            'Submit Telegram actions once per turn. Return entries where each item is either {"type":"reply","text":"...","target_ref":"tN"} or {"type":"react","react":"❤","target_ref":"tN"}. Use target_ref values from Reply Target Map. If target_ref is omitted, action applies to the triggering message.',
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

    bot.on('message', async (ctx) => {
        const messages: ModelMessage[] = [];
        const chatState = await ctx.m.getChat();
        const effectiveConfig = await ctx.m.getEffectiveConfig();
        const savedHistory = await ctx.m.getHistory();

        const useJsonResponses = effectiveConfig.ai.useJsonResponses;
        const enabledReactions = resolveEnabledReactions(
            effectiveConfig.blacklistedReactions,
        );

        const messagesToPass = chatState.messagesToPass ??
            effectiveConfig.ai.messagesToPass;
        const maxTargetCount = Math.min(
            Math.max(messagesToPass * 2, 12),
            40,
        );
        const targetRefs = buildTargetRefs(savedHistory, maxTargetCount);
        const targetRefMap = new Map(
            targetRefs.map((target) => [target.ref, target.messageId]),
        );

        let prompt = '';
        if (useJsonResponses) {
            prompt = (effectiveConfig.ai.prePrompt ?? '') + '\n\n';
        } else {
            const fallbackDumbPre =
                'Отвечай одним сообщением простым текстом без какого-либо JSON.' +
                '\nНе используй реакции. Пиши кратко и по делу.' +
                '\nИспользуй Telegram markdown, но без заголовков.';
            prompt = (effectiveConfig.ai.dumbPrePrompt ?? fallbackDumbPre) +
                '\n\n';
        }
        // TODO: Improve this check
        const isComments = savedHistory.some((m) =>
            m.info.forward_origin?.type === 'channel' &&
            m.info.from?.first_name === 'Telegram'
        );

        if (ctx.chat.type === 'private') {
            if (effectiveConfig.ai.privateChatPromptAddition) {
                prompt += effectiveConfig.ai.privateChatPromptAddition;
            }
        } else if (isComments && effectiveConfig.ai.commentsPromptAddition) {
            prompt += effectiveConfig.ai.commentsPromptAddition;
        } else if (effectiveConfig.ai.groupChatPromptAddition) {
            prompt += effectiveConfig.ai.groupChatPromptAddition;
        }

        if (chatState.hateMode && effectiveConfig.ai.hateModePrompt) {
            prompt += '\n' + effectiveConfig.ai.hateModePrompt;
        }

        prompt += '\n\n';

        const currentLocale = chatState.locale ??
            await ctx.i18n.getLocale();
        prompt += buildLanguageProtocol(currentLocale) + '\n\n';

        const character = chatState.character;
        if (character) {
            prompt += '### Character ###\n' + character.description;
        } else {
            prompt += useJsonResponses
                ? effectiveConfig.ai.prompt
                : (effectiveConfig.ai.dumbPrompt ?? effectiveConfig.ai.prompt);
        }

        let chatInfoMsg = `Date and time right now: ${prettyDate()}`;

        if (ctx.chat.type === 'private') {
            chatInfoMsg +=
                `\nЛичный чат с ${ctx.from.first_name} (@${ctx.from.username})`;
        } else {
            const activeMembers = await ctx.m.getActiveMembers();
            if (activeMembers.length > 0) {
                const prettyMembersList = activeMembers.map((m) => {
                    let text = `- ${m.first_name}`;
                    if (m.username) {
                        text += ` (@${m.username})`;
                    }
                    return text;
                }).join('\n');

                chatInfoMsg +=
                    `\nChat: ${ctx.chat.title}, Active members:\n${prettyMembersList}`;
            }
        }

        // If we have notes, add them to messages
        if (chatState.notes.length > 0) {
            chatInfoMsg += `\n\nChat notes:\n${chatState.notes.join('\n')}`;
        }

        if (chatState.memory) {
            chatInfoMsg +=
                `\n\nMY OWN PERSONAL NOTES AND MEMORY:\n${chatState.memory}`;
        }

        prompt += `\n\n### Chat Info ###\n${chatInfoMsg}`;

        if (useJsonResponses) {
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
        }

        messages.push({
            role: 'system',
            content: prompt,
        });

        const modelRef = chatState.chatModel ?? effectiveConfig.ai.model;
        const parsedModel = parseModelRef(modelRef);

        let history: ModelMessage[] = [];
        try {
            history = await makeHistoryV2(
                { token: bot.token, id: bot.botInfo.id },
                bot.api,
                logger,
                savedHistory,
                {
                    messagesLimit: messagesToPass,
                    bytesLimit: effectiveConfig.ai.bytesLimit,
                    symbolLimit: effectiveConfig.ai.messageMaxLength,
                    includeReactions: true,
                    attachments:
                        effectiveConfig.ai.includeAttachmentsInHistory &&
                        parsedModel.provider === 'google',
                },
            );
        } catch (error) {
            logger.error('Could not get history: ', error);

            if (!ctx.info.isRandom) {
                await ctx.reply(getRandomNepon(effectiveConfig));
            }
            return;
        }

        const annotatedHistory = annotateHistoryWithTargetRefs(
            history,
            targetRefs,
        );
        messages.push(...annotatedHistory);

        let finalPrompt = useJsonResponses
            ? effectiveConfig.ai.finalPrompt
            : (effectiveConfig.ai.dumbFinalPrompt ?? 'Ответь простым текстом.');
        if (useJsonResponses) {
            finalPrompt +=
                ' Return only actions array using typed entries and target_ref values from Reply Target Map.';
        }
        if (!useJsonResponses && ctx.info.userToReply) {
            finalPrompt += ` Ответь на сообщение от ${ctx.info.userToReply}.`;
        }

        messages.push({
            role: 'user',
            content: finalPrompt,
        });

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

        const generatePlainTextOutput = async (): Promise<ChatEntry[]> => {
            const generationPolicy = resolveGenerationPolicy({
                modelRef,
                config: effectiveConfig.ai,
                task: 'chat',
                expectsStructuredOutput: false,
            });
            const providerOptions = generationPolicy
                .providerOptions as Parameters<
                    typeof generateText
                >[0]['providerOptions'];
            const response = await generateText({
                model: generationPolicy.model,
                providerOptions,
                maxRetries: maxGenerationRetries,
                messages,
                temperature: effectiveConfig.ai.temperature,
                topK: effectiveConfig.ai.topK,
                topP: effectiveConfig.ai.topP,
                maxOutputTokens: generationPolicy.maxOutputTokens,
                experimental_telemetry: {
                    isEnabled: true,
                    functionId: 'user-message-dumb',
                    metadata: buildGenerationTelemetryMetadata({
                        sessionId: ctx.chat.id.toString(),
                        userId: ctx.from?.id.toString() ?? '',
                        chatName,
                        tags,
                        temperature: effectiveConfig.ai.temperature,
                        topK: effectiveConfig.ai.topK,
                        topP: effectiveConfig.ai.topP,
                        policy: generationPolicy,
                    }),
                },
            });
            return [{ type: 'reply', text: response.text }];
        };

        let output: ChatEntry[];
        try {
            if (useJsonResponses) {
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
                        metadata: buildGenerationTelemetryMetadata({
                            sessionId: ctx.chat.id.toString(),
                            userId: ctx.from?.id.toString() ?? '',
                            chatName,
                            tags,
                            temperature: effectiveConfig.ai.temperature,
                            topK: effectiveConfig.ai.topK,
                            topP: effectiveConfig.ai.topP,
                            policy: generationPolicy,
                        }),
                    },
                });

                const chatActionsToolCall = result.toolCalls.find((call) =>
                    call.toolName === 'send_chat_actions'
                );
                const parsedToolCallInput = chatActionsToolCall
                    ? chatActionsToolInputSchema.safeParse(
                        chatActionsToolCall.input,
                    )
                    : undefined;

                if (parsedToolCallInput?.success) {
                    output = parsedToolCallInput.data.entries;
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
            } else {
                output = await generatePlainTextOutput();
            }
        } catch (error) {
            let blockReason: string | undefined;
            if (error instanceof APICallError && error.responseBody) {
                try {
                    const parsedError = JSON.parse(error.responseBody);
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

            logger.error('Could not get response: ', error);
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

        function resolveTargetMessageId(
            targetRef?: string,
        ): number | undefined {
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

            return ctx.msg.message_id;
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
                            await ctx.api.setMessageReaction(
                                ctx.chat.id,
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

            let msgToReply: number | undefined;
            msgToReply = resolveTargetMessageId(res.target_ref);
            if (!msgToReply && lastMsgId) {
                msgToReply = lastMsgId;
            }

            let replyInfo;
            try {
                if (ctx.chat.type === 'private') {
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
                    );
                }
            } catch (error) {
                if (
                    ctx.chat.type !== 'private' &&
                    isMissingSendTextRightsError(error)
                ) {
                    await ctx.m.setDisableRepliesDueToRights(true);
                    await ctx.m.setDisabledReplyRightsLastProbeAt(Date.now());
                    logger.warn(
                        'Disabled replies in chat due to missing send rights',
                    );
                    return;
                }

                logger.error('Could not reply to user: ', error);
                if (!ctx.info.isRandom) {
                    await ctx.reply(getRandomNepon(effectiveConfig));
                }
                return;
            }

            lastMsgId = replyInfo.message_id;

            let replyTo: ReplyTo | undefined;
            if (replyInfo.reply_to_message) {
                replyTo = {
                    id: replyInfo.reply_to_message.message_id,
                    text: replyInfo.reply_to_message.text ??
                        replyInfo.reply_to_message.caption ?? '',
                    isMyself: false,
                    info: replyInfo.reply_to_message,
                };
            }

            await ctx.m.addMessage({
                id: replyInfo.message_id,
                text: replyText,
                isMyself: true,
                info: replyInfo,
                replyTo,
            });

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
    });
}
