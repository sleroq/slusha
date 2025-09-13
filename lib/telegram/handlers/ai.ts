import { Bot } from 'grammy';
import { SlushaContext } from '../setup-bot.ts';
import { Config, safetySettings } from '../../config.ts';
import logger from '../../logger.ts';
import { APICallError, generateObject, generateText, ModelMessage } from 'ai';
import { google } from '@ai-sdk/google';
import { makeHistoryV2 } from '../../history.ts';
import { getRandomNepon, prettyDate } from '../../helpers.ts';
import { replyGeneric, replyWithMarkdownId } from '../helpers.ts';
import { ReplyTo } from '../../memory.ts';
import {
    chatResponseSchema,
    isReactEntry,
    isTextEntry,
} from '../../ai/schema.ts';
import { canonicalizeReaction } from '../reactions.ts';

export default function registerAI(bot: Bot<SlushaContext>, config: Config) {
    bot.on('message', async (ctx) => {
        const messages: ModelMessage[] = [];

        const useJsonResponses = config.ai.useJsonResponses;

        let prompt = '';
        if (useJsonResponses) {
            prompt = (config.ai.prePrompt ?? '') + '\n\n';
        } else {
            const fallbackDumbPre =
                'Отвечай одним сообщением простым текстом без какого-либо JSON.' +
                '\nНе используй реакции. Пиши кратко и по делу.' +
                '\nИспользуй Telegram markdown, но без заголовков.';
            prompt = (config.ai.dumbPrePrompt ?? fallbackDumbPre) + '\n\n';
        }
        const savedHistory = ctx.m.getHistory();

        // TODO: Improve this check
        const isComments = savedHistory.some((m) =>
            m.info.forward_origin?.type === 'channel' &&
            m.info.from?.first_name === 'Telegram'
        );

        if (ctx.chat.type === 'private') {
            if (config.ai.privateChatPromptAddition) {
                prompt += config.ai.privateChatPromptAddition;
            }
        } else if (isComments && config.ai.commentsPromptAddition) {
            prompt += config.ai.commentsPromptAddition;
        } else if (config.ai.groupChatPromptAddition) {
            prompt += config.ai.groupChatPromptAddition;
        }

        if (ctx.m.getChat().hateMode && config.ai.hateModePrompt) {
            prompt += '\n' + config.ai.hateModePrompt;
        }

        prompt += '\n\n';

        const character = ctx.m.getChat().character;
        if (character) {
            prompt += '### Character ###\n' + character.description;
        } else {
            prompt += useJsonResponses
                ? config.ai.prompt
                : (config.ai.dumbPrompt ?? config.ai.prompt);
        }

        messages.push({
            role: 'system',
            content: prompt,
        });

        let chatInfoMsg = `Date and time right now: ${prettyDate()}`;

        if (ctx.chat.type === 'private') {
            chatInfoMsg +=
                `\nЛичный чат с ${ctx.from.first_name} (@${ctx.from.username})`;
        } else {
            const activeMembers = ctx.m.getActiveMembers();
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
        if (ctx.m.getChat().notes.length > 0) {
            chatInfoMsg += `\n\nChat notes:\n${
                ctx.m.getChat().notes.join('\n')
            }`;
        }

        if (ctx.m.getChat().memory) {
            chatInfoMsg +=
                `\n\nMY OWN PERSONAL NOTES AND MEMORY:\n${ctx.m.getChat().memory}`;
        }

        messages.push({
            role: 'assistant',
            content: chatInfoMsg,
        });

        const messagesToPass = ctx.m.getChat().messagesToPass ??
            config.ai.messagesToPass;

        let history: ModelMessage[] = [];
        try {
            history = await makeHistoryV2(
                { token: bot.token, id: bot.botInfo.id },
                bot.api,
                logger,
                savedHistory,
                {
                    messagesLimit: messagesToPass,
                    bytesLimit: config.ai.bytesLimit,
                    symbolLimit: config.ai.messageMaxLength,
                    includeReactions: true,
                },
            );
        } catch (error) {
            logger.error('Could not get history: ', error);

            if (!ctx.info.isRandom) {
                await ctx.reply(getRandomNepon(config));
            }
            return;
        }

        messages.push(...history);

        let finalPrompt = useJsonResponses
            ? config.ai.finalPrompt
            : (config.ai.dumbFinalPrompt ?? 'Ответь простым текстом.');
        if (ctx.info.userToReply) {
            finalPrompt += ` Ответь на сообщение от ${ctx.info.userToReply}.`;
        }

        messages.push({
            role: 'user',
            content: finalPrompt,
        });

        const model = ctx.m.getChat().chatModel ?? config.ai.model;

        const time = new Date().getTime();

        const tags = ['user-message'];
        if (ctx.chat.type === 'private') {
            tags.push('private');
        }
        if (ctx.info.isRandom) {
            tags.push('random');
        }

        let output;
        try {
            if (useJsonResponses) {
                const result = await generateObject({
                    model: google(model),
                    providerOptions: {
                        google: {
                            safetySettings,
                            thinkingConfig: { thinkingBudget: 1024 },
                        },
                    },
                    schema: chatResponseSchema,
                    temperature: config.ai.temperature,
                    topK: config.ai.topK,
                    topP: config.ai.topP,
                    messages,
                    experimental_telemetry: {
                        isEnabled: true,
                        functionId: 'user-message',
                        metadata: {
                            sessionId: ctx.chat.id.toString(),
                            userId: ctx.chat.type === 'private'
                                ? ctx.from?.id.toString()
                                : '',
                            tags,
                        },
                    },
                });
                output = result.object;
            } else {
                const response = await generateText({
                    model: google(model),
                    providerOptions: {
                        google: {
                            safetySettings,
                            thinkingConfig: { thinkingBudget: 1024 },
                        },
                    },
                    messages,
                    temperature: config.ai.temperature,
                    topK: config.ai.topK,
                    topP: config.ai.topP,
                    experimental_telemetry: {
                        isEnabled: true,
                        functionId: 'user-message-dumb',
                        metadata: {
                            sessionId: ctx.chat.id.toString(),
                            userId: ctx.chat.type === 'private'
                                ? ctx.from?.id.toString()
                                : '',
                            tags,
                        },
                    },
                });
                output = [{ text: response.text }];
            }
        } catch (error) {
            logger.error('Could not get response: ', error);
            if (error instanceof APICallError) {
                if (error.responseBody) {
                    let err;
                    try {
                        err = JSON.parse(error.responseBody);
                    } catch (error) {
                        logger.error('Could not parse error response: ', error);
                    }
                    if (err?.promptFeedback?.blockReason) {
                        return ctx.reply(
                            'API провайдер запрещает тебе отвечать. Возможно это из-за персонажа: ' +
                                err.promptFeedback.blockReason,
                        );
                    }
                }
            }
            if (!ctx.info.isRandom) {
                await ctx.reply(getRandomNepon(config));
            }
            return;
        }

        const name = ctx.chat.first_name ?? ctx.chat.title;
        const username = ctx.chat?.username ? `(@${ctx.chat.username})` : '';

        logger.info(
            `Time to get response ${ctx.info.isRandom ? '(random)' : ''}:`,
            (new Date().getTime() - time) / 1000,
            `for "${name}" ${username}. `,
        );

        function resolveTargetMessageId(
            replyToUsername?: string,
            offset?: number,
            fallbackToLast = true,
        ): number | undefined {
            const normOffset = typeof offset === 'number' && offset >= 0
                ? offset
                : 0;
            const history = savedHistory;
            if (history.length === 0) return undefined;
            const uname = replyToUsername?.startsWith('@')
                ? replyToUsername.slice(1)
                : replyToUsername;
            let candidates = history.filter((m) => !m.isMyself);
            if (uname) {
                candidates = history.filter((m) =>
                    m.info.from?.username === uname
                );
                if (candidates.length === 0) {
                    candidates = history.filter((m) => !m.isMyself);
                }
            }
            const idxFromEnd = Math.max(
                0,
                Math.min(normOffset, candidates.length - 1),
            );
            const target = candidates[candidates.length - 1 - idxFromEnd];
            if (target?.id) return target.id;
            if (fallbackToLast) {
                return history[history.length - 1]?.id;
            }
            return undefined;
        }

        let lastMsgId: number | undefined = undefined;
        for (let i = 0; i < output.length; i++) {
            const res = output[i];
            if (
                isReactEntry(res) && typeof res.react === 'string' &&
                res.react.trim().length > 0
            ) {
                const canon = canonicalizeReaction(res.react.trim());
                if (canon) {
                    const targetId = resolveTargetMessageId(
                        res.reply_to,
                        res.offset,
                        true,
                    );
                    if (targetId) {
                        try {
                            await ctx.api.setMessageReaction(
                                ctx.chat.id,
                                targetId,
                                [{ type: 'emoji', emoji: canon }],
                            );
                            ctx.m.addEmojiReaction(targetId, canon, {
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
                        'Reaction not allowed, dropping: ' + res.react,
                    );
                }
                continue;
            }

            if (!isTextEntry(res)) {
                continue;
            }

            let replyText = (res.text ?? '').trim();
            if (replyText.length === 0) {
                logger.info('Empty response from AI');
                return;
            }

            if (replyText.startsWith('* ')) {
                replyText = replyText.slice(1);
                replyText = '-' + replyText;
            }

            let msgToReply: number | undefined;
            if (res.reply_to || typeof res.offset === 'number') {
                msgToReply = resolveTargetMessageId(
                    res.reply_to,
                    res.offset,
                    true,
                );
            } else if (!useJsonResponses && ctx.info.userToReply) {
                msgToReply = resolveTargetMessageId(
                    ctx.info.userToReply,
                    undefined,
                    true,
                );
            }
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
                logger.error('Could not reply to user: ', error);
                if (!ctx.info.isRandom) {
                    await ctx.reply(getRandomNepon(config));
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

            ctx.m.addMessage({
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
