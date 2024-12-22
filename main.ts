import Werror from './lib/werror.ts';
import logger from './lib/logger.ts';
import resolveConfig, { Config, safetySettings } from './lib/config.ts';
import setupBot from './lib/telegram/setup-bot.ts';
import { loadMemory } from './lib/memory.ts';

import { generateText } from 'npm:ai';
import { google } from 'npm:@ai-sdk/google';

import {
    deleteOldFiles,
    fixAIResponse,
    getRandomNepon,
    makeHistory,
    prettyPrintPrompt,
    probability,
    Prompt,
    removeBotName,
    sliceMessage,
    testMessage,
} from './lib/helpers.ts';
import { doTyping, replyWithMarkdown } from './lib/telegram/helpers.ts';
import { limit } from 'https://deno.land/x/grammy_ratelimiter@v1.2.0/mod.ts';
import character from './lib/telegram/bot/character.ts';
import msgDelay from './lib/telegram/bot/msg-delay.ts';
import notes from './lib/telegram/bot/notes.ts';

let config: Config;
try {
    config = await resolveConfig();
} catch (error) {
    logger.error('Config error: ', error);
    Deno.exit(1);
}

const memory = await loadMemory();

const bot = await setupBot(config, memory);

bot.command('start', (ctx) => ctx.reply(config.startMessage));

bot.command('forget', async (ctx) => {
    ctx.m.clear();
    ctx.m.getChat().notes = [];
    await ctx.reply('История очищена');
});

bot.use(character);

bot.use(msgDelay(config));

bot.command('model', (ctx) => {
    // Check if user is admin
    if (
        !config.adminIds || !ctx.msg.from ||
        !config.adminIds.includes(ctx.msg.from.id)
    ) {
        return;
    }

    const args = ctx.msg.text.split(' ').map((arg) => arg.trim()).filter((
        arg,
    ) => arg !== '');

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

bot.command('summary', (ctx) => {
    // Skip for private chats
    if (ctx.msg.chat.type === 'private') {
        return ctx.reply('Это только для групповых чатов');
    }

    ctx.m.getChat().lastUse = Date.now();
    const notes = ctx.m.getChat().notes;

    if (notes.length === 0) {
        return ctx.reply('Пока маловато сообщений прошло, сам прочитай');
    }

    return ctx.reply(notes.join('\n'));
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

bot.use(notes(config, bot.botInfo.id));

// Decide if we should reply to user
bot.on('message', (ctx, next) => {
    const msg = ctx.m.getLastMessage();

    // Ignore if text is empty
    if (!msg.text && !('photo' in msg.info)) {
        return;
    }

    // Ignore if message is from itself
    if (msg.info.via_bot?.id === bot.botInfo.id) {
        return;
    }

    // Direct message
    if (ctx.msg.chat.type === 'private') {
        logger.info('Direct message');
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

    // Direct reply to bot
    if (ctx.msg.reply_to_message?.from?.id === bot.botInfo.id) {
        logger.info('Direct reply to bot');
        ctx.m.getChat().lastUse = Date.now();
        return next();
    }

    // Mentined bot's name
    if (
        new RegExp(`(${config.names.join('|')})`, 'gmi').test(msg.text) &&
        // Ignore forwarded messages with bot's name
        !(msg.info.forward_origin?.type === 'user' &&
            msg.info.forward_origin.sender_user.id === bot.botInfo.id)
    ) {
        logger.info("Replying because of mentioned bot's name");
        return next();
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

    if (probability(config.randomReplyProbability)) {
        logger.info('Replying because of random reply probability');
        ctx.info.isRandom = true;
        return next();
    }
});

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

    const messages: Prompt = [];

    let prompt = config.ai.prePrompt;
    const character = ctx.m.getChat().character;
    if (character) {
        prompt += character.description;
    } else {
        prompt += config.ai.prompt;
    }

    messages.push({
        role: 'system',
        content: prompt,
    });

    // If we have nots, add them to messages
    if (ctx.m.getChat().notes.length > 0) {
        messages.push({
            role: 'assistant',
            content: `Chat notes:\n${ctx.m.getChat().notes.join('\n')}`,
        });
    }

    let history = [];
    try {
        history = await makeHistory(
            { token: bot.token, id: bot.botInfo.id },
            bot.api,
            logger,
            ctx.m.getHistory(),
            {
                messagesLimit: config.ai.messagesToPass,
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
        finalPrompt +=
            ` Ответь только на последнее сообщение от ${ctx.info.userToReply}.`;
    } else {
        finalPrompt += ` Ответь только на последнее сообщение.`;
    }

    messages.push({
        role: 'user',
        content: finalPrompt,
    });

    const model = ctx.m.getChat().chatModel ?? config.ai.model;

    const time = new Date().getTime();
    logger.info(prettyPrintPrompt(messages));

    // TODO: Fix repeating replies
    let response;
    try {
        response = await generateText({
            model: google(model, { safetySettings }),
            messages,
            temperature: config.ai.temperature,
            topK: config.ai.topK,
            topP: config.ai.topP,
        });
    } catch (error) {
        logger.error('Could not get response: ', error);
        // logger.info(prettyPrintPrompt(messages));

        if (!ctx.info.isRandom) {
            await ctx.reply(getRandomNepon(config));
        }
        return;
    }

    let replyText = response.text;

    replyText = removeBotName(
        replyText,
        bot.botInfo.first_name,
        bot.botInfo.username,
    );

    replyText = fixAIResponse(replyText);

    const name = ctx.chat.first_name ?? ctx.chat.title;
    const username = ctx.chat?.username ? `(@${ctx.chat.username})` : '';
    logger.info(
        'Time to get response:',
        (new Date().getTime() - time) / 1000,
        `for "${name}" ${username}. Response:`,
        replyText,
    );

    if (replyText.length === 0) {
        logger.warn(
            `Empty response from AI: "${response.text}" => "${replyText}"`,
        );

        if (!ctx.info.isRandom) {
            await ctx.reply(getRandomNepon(config));
        }

        return;
    }

    let replyInfo;
    try {
        replyInfo = await replyWithMarkdown(ctx, replyText);
    } catch (error) {
        logger.error('Could not reply to user: ', error);

        if (!ctx.info.isRandom) {
            await ctx.reply(getRandomNepon(config));
        }
        return;
    }

    // Save bot's reply
    ctx.m.addMessage({
        id: replyInfo.message_id,
        text: replyText,
        isMyself: true,
        info: ctx.message,
    });

    typing.abort();
});

void bot.start({ drop_pending_updates: config.dropPendingUpdates });

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
