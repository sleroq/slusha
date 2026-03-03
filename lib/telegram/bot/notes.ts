import { Composer } from 'grammy';
import { google } from '@ai-sdk/google';
import { generateText, ModelMessage } from 'ai';
import { Config, safetySettings } from '../../config.ts';
import logger from '../../logger.ts';
import { SlushaContext } from '../setup-bot.ts';
import { makeNotesHistory } from '../../history.ts';

export default function notes(config: Config, botId: number) {
    const bot = new Composer<SlushaContext>();

    // if bot was used in last 3 days
    bot.on('message', (ctx, next) => {
        async function handleNotes() {
            const frequency = config.ai.notesFrequency;
            const chat = await ctx.m.getChat();
            const history = await ctx.m.getHistory();

            if (
                chat.lastUse <
                    Date.now() - config.chatLastUseNotes * 24 * 60 * 60 * 1000
            ) {
                return;
            }

            if (history.length < config.ai.notesFrequency / 2) {
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
                        symbolLimit: config.ai.messageMaxLength / 3,
                        bytesLimit: config.ai.bytesLimit,
                        characterName,
                    },
                );
            } catch (error) {
                logger.error('Could not get history: ', error);
                return;
            }

            const model = config.ai.notesModel ?? config.ai.model;
            const prompt = config.ai.notesPrompt;

            const messages: ModelMessage[] = [
                {
                    role: 'system',
                    content: prompt,
                },
                ...context,
                {
                    role: 'user',
                    content: config.ai.notesPrompt,
                },
            ];

            const start = Date.now();

            const tags = ['notes'];
            if (ctx.chat.type === 'private') {
                tags.push('private');
            }

            let response;
            try {
                response = await generateText({
                    model: google(model),
                    providerOptions: { google: { safetySettings } },
                    messages,
                    temperature: config.ai.temperature,
                    topK: config.ai.topK,
                    topP: config.ai.topP,
                    experimental_telemetry: {
                        isEnabled: true,
                        functionId: 'generate-notes',
                        metadata: {
                            sessionId: ctx.chat.id.toString(),
                            tags,
                            userId: ctx.chat.type === 'private'
                                ? ctx.from?.id.toString()
                                : '',
                        },
                    },
                });
            } catch (error) {
                logger.error('Could not get summary: ', error);
                return;
            }

            const chatName = ctx.chat.title ?? ctx.chat.first_name;

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
            await ctx.m.removeOldNotes(config.maxNotesToStore);
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
            const frequency = config.ai.memoryFrequency;
            const chat = await ctx.m.getChat();
            const history = await ctx.m.getHistory();

            if (
                chat.lastUse <
                    Date.now() - config.chatLastUseNotes * 24 * 60 * 60 * 1000
            ) {
                return;
            }

            if (history.length < config.ai.memoryFrequency / 2) {
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
                        symbolLimit: config.ai.messageMaxLength / 3,
                        bytesLimit: config.ai.bytesLimit,
                        characterName,
                    },
                );
            } catch (error) {
                logger.error('Could not get history: ', error);
                return;
            }

            let prompt = ''; // Intentionaly no pre-prompt here

            // TODO: Improve this check
            const isComments = savedHistory.some(
                (m) =>
                    m.info.forward_origin?.type === 'channel' &&
                    m.info.from?.first_name === 'Telegram',
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

            prompt += '\n\n';

            const currentChat = await ctx.m.getChat();
            const character = currentChat.character;
            if (character) {
                prompt += '### Character ###\n' + character.description;
            } else {
                prompt += config.ai.prompt;
            }

            let chatInfoMsg = `Date and time right now: ${
                new Date().toLocaleString()
            }`;

            if (ctx.chat.type === 'private') {
                chatInfoMsg +=
                    `\nЛичный чат с ${ctx.from.first_name} (@${ctx.from.username})`;
            } else {
                const activeMembers = await ctx.m.getActiveMembers();
                if (activeMembers.length > 0) {
                    const prettyMembersList = activeMembers
                        .map((m) => {
                            let text = `- ${m.first_name}`;
                            if (m.username) {
                                text += ` (@${m.username})`;
                            }
                            return text;
                        })
                        .join('\n');

                    chatInfoMsg +=
                        `\nChat: ${ctx.chat.title}, Active members:\n${prettyMembersList}`;
                }
            }

            prompt += '\n\n' + chatInfoMsg;

            let memPrompt = config.ai.memoryPrompt;
            if (currentChat.memory) {
                memPrompt += '\n\n' +
                    config.ai.memoryPromptRepeat +
                    '\n' +
                    currentChat.memory;
            }

            prompt += '\n\n' + config.ai.memoryPrompt;

            const model = config.ai.memoryModel ?? config.ai.model;

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

            let response;
            try {
                response = await generateText({
                    model: google(model),
                    providerOptions: {
                        google: {
                            safetySettings,
                            thinkingConfig: { thinkingBudget: 2048 },
                        },
                    },
                    messages,
                    temperature: config.ai.temperature,
                    topK: config.ai.topK,
                    topP: config.ai.topP,
                    experimental_telemetry: {
                        isEnabled: true,
                        functionId: 'generate-memory',
                        metadata: {
                            sessionId: ctx.chat.id.toString(),
                            tags,
                            userId: ctx.chat.type === 'private'
                                ? ctx.from?.id.toString()
                                : '',
                        },
                    },
                });
            } catch (error) {
                logger.error('Could not get memory: ', error);
                return;
            }

            const chatName = ctx.chat.title ?? ctx.chat.first_name;

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
