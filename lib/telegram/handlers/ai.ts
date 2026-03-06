import { Bot } from 'grammy';
import { SlushaContext } from '../setup-bot.ts';
import logger from '../../logger.ts';
import {
    APICallError,
    generateText,
    ModelMessage,
    Output,
} from 'ai';
import { makeHistoryV2 } from '../../history.ts';
import { getRandomNepon, prettyDate } from '../../helpers.ts';
import { replyGeneric, replyWithMarkdownId } from '../helpers.ts';
import { ReplyTo } from '../../memory.ts';
import {
    chatResponseSchema,
    ChatEntry,
    isReactEntry,
    isTextEntry,
} from '../../ai/schema.ts';
import { canonicalizeReaction } from '../reactions.ts';
import { isMissingSendTextRightsError } from '../reply-rights.ts';
import { resolveGenerationPolicy } from '../../ai/generation-policy.ts';
import { parseModelRef } from '../../ai/model-ref.ts';
import { buildGenerationTelemetryMetadata } from '../../ai/telemetry-metadata.ts';

function isNoObjectGeneratedError(
    error: unknown,
): error is Error & { text?: string } {
    return error instanceof Error &&
        (error.name === 'AI_NoObjectGeneratedError' ||
            error.name === 'NoObjectGeneratedError');
}

function isNoOutputGeneratedError(error: unknown): error is Error {
    return error instanceof Error &&
        (error.name === 'AI_NoOutputGeneratedError' ||
            error.name === 'NoOutputGeneratedError');
}

function truncateForLog(text: string, maxLength = 4000): string {
    if (text.length <= maxLength) {
        return text;
    }

    return `${text.slice(0, maxLength)}...[truncated ${text.length - maxLength} chars]`;
}

function unwrapJsonCodeBlock(text: string): string {
    const trimmed = text.trim();
    const fencedMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
    return fencedMatch?.[1]?.trim() ?? trimmed;
}

function tryRecoverChatOutput(rawText: string): ChatEntry[] | undefined {
    const normalizedText = unwrapJsonCodeBlock(rawText);
    if (normalizedText.length === 0) {
        return undefined;
    }

    let parsed: unknown;
    try {
        parsed = JSON.parse(normalizedText);
    } catch {
        return undefined;
    }

    const normalized = Array.isArray(parsed) ? parsed : [parsed];
    const validated = chatResponseSchema.safeParse(normalized);
    if (!validated.success) {
        return undefined;
    }

    return validated.data;
}

function getLanguageName(localeCode: string): string {
    const map: Record<string, string> = {
        ru: 'Russian',
        uk: 'Ukrainian',
        en: 'English',
        pt: 'Portuguese',
        hi: 'Hindi',
        id: 'Indonesian',
    };
    return map[localeCode] ?? 'the chat language';
}

function buildLanguageProtocol(defaultLocale: string): string {
    const lang = getLanguageName(defaultLocale);
    return [
        '### Language Protocol ###',
        `- Default to ${lang} language in all interactions`,
        "- Switch to other languages only when: 1) User explicitly writes in other language 2) User directly requests other language 3) User clearly doesn't understand the default language",
        `- Always return to ${lang} at first opportunity`,
        '- Maintain authentic speech patterns regardless of language used',
        '- Answer in short messages like a human would. Do not write long text in one message',
        '- Each reply must be unique',
        '- DO NOT REPEAT YOUR OWN MESSAGES OR YOU RISK BEING BANNED IN CHAT',
    ].join('\n');
}

export default function registerAI(bot: Bot<SlushaContext>) {
    bot.on('message', async (ctx) => {
        const messages: ModelMessage[] = [];
        const chatState = await ctx.m.getChat();
        const effectiveConfig = await ctx.m.getEffectiveConfig();

        const useJsonResponses = effectiveConfig.ai.useJsonResponses;

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
        const savedHistory = await ctx.m.getHistory();

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

        messages.push({
            role: 'system',
            content: prompt,
        });

        const messagesToPass = chatState.messagesToPass ??
            effectiveConfig.ai.messagesToPass;
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

        messages.push(...history);

        let finalPrompt = useJsonResponses
            ? effectiveConfig.ai.finalPrompt
            : (effectiveConfig.ai.dumbFinalPrompt ?? 'Ответь простым текстом.');
        if (ctx.info.userToReply) {
            finalPrompt += ` Ответь на сообщение от ${ctx.info.userToReply}.`;
        }

        messages.push({
            role: 'user',
            content: finalPrompt,
        });

        const time = new Date().getTime();

        const tags = ['user-message'];
        if (ctx.chat.type === 'private') {
            tags.push('private');
        }
        if (ctx.info.isRandom) {
            tags.push('random');
        }

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
                        userId: ctx.chat.type === 'private'
                            ? ctx.from?.id.toString()
                            : '',
                        tags,
                        temperature: effectiveConfig.ai.temperature,
                        topK: effectiveConfig.ai.topK,
                        topP: effectiveConfig.ai.topP,
                        policy: generationPolicy,
                    }),
                },
            });
            return [{ text: response.text }];
        };

        let output: ChatEntry[];
        let structuredOutputRecovery: 'none' | 'recovered_raw' |
            'fallback_plain_text' = 'none';
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
                try {
                    const result = await generateText({
                        model: generationPolicy.model,
                        providerOptions,
                        output: Output.object({
                            schema: chatResponseSchema,
                        }),
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
                                userId: ctx.chat.type === 'private'
                                    ? ctx.from?.id.toString()
                                    : '',
                                tags,
                                temperature: effectiveConfig.ai.temperature,
                                topK: effectiveConfig.ai.topK,
                                topP: effectiveConfig.ai.topP,
                                policy: generationPolicy,
                            }),
                        },
                    });
                    try {
                        output = result.output;
                    } catch (error) {
                        if (isNoOutputGeneratedError(error)) {
                            logger.warn(
                                'Structured output missing; logging raw model response',
                                {
                                    modelRef,
                                    chatId: ctx.chat.id,
                                    finishReason: result.finishReason,
                                    rawText: truncateForLog(result.text),
                                    steps: result.steps.map((step) => ({
                                        finishReason: step.finishReason,
                                        text: truncateForLog(step.text),
                                    })),
                                    usage: result.totalUsage,
                                },
                            );

                            const recoveredOutput = tryRecoverChatOutput(
                                result.text,
                            );
                            if (recoveredOutput) {
                                structuredOutputRecovery = 'recovered_raw';
                                logger.warn(
                                    'Structured output missing; recovered from raw model text',
                                    {
                                        modelRef,
                                        chatId: ctx.chat.id,
                                    },
                                );
                                output = recoveredOutput;
                            } else {
                                structuredOutputRecovery =
                                    'fallback_plain_text';
                                logger.warn(
                                    'Structured output missing; retrying in plain text mode',
                                    {
                                        modelRef,
                                        chatId: ctx.chat.id,
                                    },
                                );
                                output = await generatePlainTextOutput();
                            }
                        } else {
                            throw error;
                        }
                    }
                } catch (error) {
                    if (!isNoObjectGeneratedError(error)) {
                        throw error;
                    }

                    const recoveredOutput = tryRecoverChatOutput(
                        error.text ?? '',
                    );
                    if (recoveredOutput) {
                        structuredOutputRecovery = 'recovered_raw';
                        logger.warn(
                            'Structured output schema mismatch; recovered from raw model text',
                            {
                                modelRef,
                                chatId: ctx.chat.id,
                            },
                        );
                        output = recoveredOutput;
                    } else {
                        structuredOutputRecovery = 'fallback_plain_text';
                        logger.warn(
                            'Structured output schema mismatch; retrying in plain text mode',
                            {
                                modelRef,
                                chatId: ctx.chat.id,
                            },
                        );
                        output = await generatePlainTextOutput();
                    }
                }
            } else {
                output = await generatePlainTextOutput();
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
                await ctx.reply(getRandomNepon(effectiveConfig));
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
        if (structuredOutputRecovery !== 'none') {
            logger.info('Structured output recovery applied', {
                mode: structuredOutputRecovery,
                modelRef,
                chatId: ctx.chat.id,
            });
        }

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
                        'Reaction not allowed, dropping: ' + res.react,
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
