import Werror from './lib/werror.ts';
import logger from './lib/logger.ts';
import resolveConfig, { Config, safetySettings } from './lib/config.ts';
import setupBot from './lib/telegram/setup-bot.ts';
import { run } from '@grammyjs/runner';
import { loadMemory, ReplyTo } from './lib/memory.ts';

import { APICallError, CoreMessage, generateText, Output } from 'ai';
import { google } from '@ai-sdk/google';

import {
    createNameMatcher,
    deleteOldFiles,
    formatReply,
    getRandomNepon,
    msgTypeSupported,
    prettyDate,
    probability,
    sliceMessage,
    testMessage,
} from './lib/helpers.ts';
import {
    doTyping,
    replyGeneric,
    replyWithMarkdown,
    replyWithMarkdownId,
} from './lib/telegram/helpers.ts';
import { limit } from 'grammy_ratelimiter';
import character from './lib/telegram/bot/character.ts';
import optOut from './lib/telegram/bot/opt-out.ts';
import msgDelay from './lib/telegram/bot/msg-delay.ts';
import notes from './lib/telegram/bot/notes.ts';
import { makeHistoryV2 } from './lib/history.ts';
import z from 'zod';
import contextCommand from './lib/telegram/bot/context.ts';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { LangfuseExporter } from 'langfuse-vercel';

const sdk = new NodeSDK({
  traceExporter: new LangfuseExporter(),
  instrumentations: [getNodeAutoInstrumentations()],
});

sdk.start();

let config: Config;
try {
    config = await resolveConfig();
} catch (error) {
    logger.error('Config error: ', error);
    Deno.exit(1);
}

const memory = await loadMemory();
logger.info('Memory loaded');

const bot = await setupBot(config, memory);

bot.command('start', (ctx) => ctx.reply(config.startMessage));

bot.command('forget', async (ctx) => {
    ctx.m.clear();
    await ctx.reply('История очищена');
});

bot.command('lobotomy', async (ctx) => {
    if (ctx.chat.type !== 'private') {
        const admins = await ctx.getChatAdministrators();
        if (!admins.some((a) => a.user.id === ctx.from?.id)) {
            return ctx.reply('Эта команда только для администраторов чата');
        }
    }

    ctx.m.clear();
    ctx.m.getChat().notes = [];
    ctx.m.getChat().memory = undefined;
    await ctx.reply('История очищена');
});

bot.command('changelog', async (ctx) => {
    await replyWithMarkdown(
        ctx,
        '```js\n// TODO: написать что нового```\n\nМожешь пока чекнуть комиты что-ли - https://github.com/sleroq/slusha/commits/master',
    );
});

bot.use(optOut);
bot.use(contextCommand);
bot.use(character);

bot.command('model', (ctx) => {
    // Check if user is admin
    if (
        !config.adminIds || !ctx.msg.from ||
        !config.adminIds.includes(ctx.msg.from.id)
    ) {
        return ctx.reply('Not bot admin ' + ctx.msg.from?.id);
    }

    const args = ctx.msg.text
        .split(' ')
        .map((arg) => arg.trim())
        .filter((arg) => arg !== '');

    // If no parameter is passed, show current model
    if (args.length === 1) {
        return ctx.reply(ctx.m.getChat().chatModel ?? config.ai.model);
    }

    // If parameter is passed, set new model
    const newModel = args[1];
    if (newModel === 'default') {
        ctx.m.getChat().chatModel = undefined;
        return ctx.reply('Model reset');
    }

    ctx.m.getChat().chatModel = newModel;
    return ctx.reply(`Model set to ${newModel}`);
});

bot.command('random', async (ctx) => {
    const args = ctx.msg.text
        .split(' ')
        .map((arg) => arg.trim())
        .filter((arg) => arg !== '');

    const currentValue = ctx.m.getChat().randomReplyProbability ??
        config.randomReplyProbability;

    if (args.length === 1) {
        return replyWithMarkdown(
            ctx,
            'Укажи число от 0 до 50 вторым аргументом, чтобы настроить частоту случайных ответов: `/random <number>`\n' +
                `Сейчас стоит \`${currentValue}\`%\n` +
                '`/random default` - поставить значение по умолчанию',
        );
    }

    if (ctx.chat.type !== 'private') {
        const admins = await ctx.getChatAdministrators();
        if (!admins.some((a) => a.user.id === ctx.from?.id)) {
            return ctx.reply('Эта команда только для администраторов чата');
        }
    }

    const newValue = args[1];
    if (newValue === 'default') {
        ctx.m.getChat().randomReplyProbability = undefined;
        return ctx.reply('Шанс случайных ответов обновлен');
    }

    const probability = parseFloat(newValue);
    if (isNaN(probability) || probability < 0 || probability > 50) {
        return ctx.reply(
            'Нераспарсилось число. Попробуй снова',
        );
    }

    ctx.m.getChat().randomReplyProbability = probability;
    return ctx.reply(`Новая вероятность ответа: ${probability}%`);
});

bot.command('summary', (ctx) => {
    ctx.m.getChat().lastUse = Date.now();
    const notes = ctx.m.getChat().notes.slice(-config.maxNotesToStore - 2);

    if (notes.length === 0) {
        return ctx.reply('Пока маловато сообщений прошло, сам прочитай');
    }

    return ctx.reply(notes.join('\n').replaceAll('\n\n', '\n'));
});

bot.command('hatemode', async (ctx) => {
    if (ctx.chat.type !== 'private') {
        const admins = await ctx.getChatAdministrators();
        if (!admins.some((a) => a.user.id === ctx.from?.id)) {
            const msg = 'Эта команда только для администраторов чата' + '\n' +
                `Но если что, хейт сейчас ${
                    ctx.m.getChat().hateMode ? 'включен' : 'выключен'
                }`;
            return ctx.reply(msg);
        }
    }

    ctx.m.getChat().hateMode = !ctx.m.getChat().hateMode;

    return ctx.reply(
        `хейт теперь ${ctx.m.getChat().hateMode ? 'включен' : 'выключен'}`,
    );
});

bot.use(msgDelay(config));

bot.use(notes(config, bot.botInfo.id));

// Decide if we should reply to user
bot.on('message', (ctx, next) => {
    const msg = ctx.m.getLastMessage();

    if (!msg) {
        return;
    }

    // Ignore if text is empty
    if (
        !msg.text &&
        !msgTypeSupported(msg.info) &&
        !msg.info.new_chat_members // React to new members joining TODO: add to supported types
    ) {
        return;
    }

    // Ignore if message is from itself
    if (msg.info.via_bot?.id === bot.botInfo.id) {
        return;
    }

    // Direct message
    if (ctx.msg.chat.type === 'private') {
        ctx.m.getChat().lastUse = Date.now();
        return next();
    }

    // Direct reply to bot
    if (ctx.msg.reply_to_message?.from?.id === bot.botInfo.id) {
        ctx.m.getChat().lastUse = Date.now();
        return next();
    }

    // Mentined bot's name
    if (msg.text.includes(bot.botInfo.username)) {
        return next();
    }

    const characterNames = ctx.m.getChat().character?.names;
    const names = config.names.concat(characterNames ?? []);
    const nameRegex = createNameMatcher(names);

    // Mentioned any of bot's aliases
    if (
        nameRegex.test(msg.text) &&
        // Ignore forwarded messages with bot's name
        !(msg.info.forward_origin?.type === 'user' &&
            msg.info.forward_origin.sender_user.id === bot.botInfo.id)
    ) {
        ctx.m.getChat().lastUse = Date.now();
        logger.info("Replying because of mentioned bot's name");
        return next();
    }

    if (
        testMessage(config.tendToIgnore, msg.text) &&
        // If message is longer than 25 symbols - maybe it's useful
        msg.text.length < 20 &&
        probability(config.tendToIgnoreProbability)
    ) {
        // logger.info(
        //     `Ignoring because of tend to ignore "${
        //         sliceMessage(msg.text, 50)
        //     }"`,
        // );
        return;
    }

    if (
        testMessage(config.tendToReply, msg.text) &&
        probability(config.tendToReplyProbability)
    ) {
        logger.info(
            `Replying because of tend to reply "${sliceMessage(msg.text, 50)}"`,
        );
        ctx.info.isRandom = true;
        return next();
    }

    const randomReplyProbability = ctx.m.getChat().randomReplyProbability ??
        config.randomReplyProbability;

    if (probability(randomReplyProbability)) {
        logger.info('Replying because of random reply probability');
        ctx.info.isRandom = true;
        return next();
    }
});

bot.use(limit(
    {
        // Allow only 1 message to be handled every 2 seconds.
        timeFrame: 2000,
        limit: 1,

        // This is called when the limit is exceeded.
        onLimitExceeded: () => {
            // logger.info('Skipping message because rate limit exceeded');
        },

        keyGenerator: (ctx) => {
            if (ctx.hasChatType(['group', 'supergroup'])) {
                return ctx.chat.id.toString();
            }

            return ctx.from?.id.toString();
        },
    },
));

bot.use(limit(
    {
        // Allow only 20 message to be handled every 10 minutes.
        timeFrame: 1 * 60 * 1000,
        limit: 20,

        // This is called when the limit is exceeded.
        onLimitExceeded: (ctx) => {
            logger.warn('Skipping message because rate limit exceeded');
            return ctx.reply('Рейтлимитим тебя');
        },

        keyGenerator: (ctx) => {
            if (ctx.hasChatType(['group', 'supergroup'])) {
                return ctx.chat.id.toString();
            }

            return ctx.from?.id.toString();
        },
    },
));

// Get response from AI
bot.on('message', async (ctx) => {
    const typing = doTyping(ctx, logger);

    const messages: CoreMessage[] = [];

    let prompt = config.ai.prePrompt + '\n\n';
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
        prompt += config.ai.prompt;
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

    // If we have nots, add them to messages
    if (ctx.m.getChat().notes.length > 0) {
        chatInfoMsg += `\n\nChat notes:\n${ctx.m.getChat().notes.join('\n')}`;
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

    let history = [];
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

    let finalPrompt = config.ai.finalPrompt;
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

    // TODO: Fix repeating replies
    let result;
    try {
        result = await generateText({
            model: google(model, { safetySettings }),
            experimental_output: Output.object({
                schema: z.array(z.object({
                    text: z.string(),
                    reply_to: z.string().optional(),
                })),
            }),
            temperature: config.ai.temperature,
            topK: config.ai.topK,
            topP: config.ai.topP,
            messages,
            experimental_telemetry: {
                isEnabled: true,
                functionId: 'user-message',
                metadata: {
                    sessionId: ctx.chat.id.toString(),
                    userId: ctx.chat.type === 'private' ? ctx.from?.id.toString() : '',
                    tags,
                },
            },
        });
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

    const output = result.experimental_output as {
        text: string;
        reply_to?: string;
    }[];

    const name = ctx.chat.first_name ?? ctx.chat.title;
    const username = ctx.chat?.username ? `(@${ctx.chat.username})` : '';

    // console.log(
    //     messages
    //         .filter((_, i) => (i < 3) || i > messages.length - 3)
    //         .map((m) => formatReply(m, character))
    //         .join('\n\n'),
    // );
    logger.info(
        'Time to get response:',
        (new Date().getTime() - time) / 1000,
        `for "${name}" ${username}. Response:\n`,
        formatReply(output, character),
    );

    let lastMsgId = null;
    for (let i = 0; i < output.length; i++) {
        const res = output[i];
        let replyText = res.text.trim();

        if (replyText.length === 0) {
            logger.info(
                `Empty response from AI`,
            );

            typing.abort();

            return;
        }

        // Replace lists with bullets
        if (replyText.startsWith('* ')) {
            replyText = replyText.slice(1);
            replyText = '-' + replyText;
        }

        let msgToReply;
        if (res.reply_to) {
            // Find latest message with this username
            msgToReply = savedHistory.findLast((m) =>
                '@' + m.info.from?.username === res.reply_to
            )?.id;
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

        // Save bot's reply
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
        let msToWait = output[i + 1].text.length / typingSpeed * 60 * 1000;

        if (msToWait > 5000) {
            msToWait = 5000;
        }

        await new Promise((resolve) => setTimeout(resolve, msToWait));
    }

    typing.abort();
});

run(bot, {
    runner: {
        // @ts-expect-error TODO: Seems to work
        drop_pending_updates: true,
    },
});
logger.info('Bot started');

// TODO: Remind users about bot existence

// Save memory every minute
setInterval(async () => {
    try {
        await memory.save();
    } catch (error) {
        logger.error('Could not save memory: ', error);
    }
}, 60 * 1000);

// Delete old files every hour
setInterval(async () => {
    try {
        await deleteOldFiles(logger, config.filesMaxAge);
    } catch (error) {
        logger.error('Could not delete old files: ', error);
    }
}, 60 * 60 * 1000);

async function gracefulShutdown() {
    try {
        await sdk.shutdown();
    } catch (error) {
        logger.error('Could not shutdown SDK: ', error);
    }

    try {
        await memory.save();
        logger.info('Memory saved on exit');
    } catch (error) {
        throw new Werror(error, 'Saving memory on exit');
    } finally {
        bot.stop();
        Deno.exit();
    }
}

// Save memory on exit
Deno.addSignalListener('SIGINT', gracefulShutdown);
Deno.addSignalListener('SIGTERM', gracefulShutdown);
