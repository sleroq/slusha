import { Bot, Context } from 'https://deno.land/x/grammy@v1.14.1/mod.ts';
import AIApi from './ai-api.ts';
import Werror from './lib/werror.ts';
import { delay } from 'https://deno.land/std@0.177.0/async/mod.ts';
import { limit } from 'https://deno.land/x/grammy_ratelimiter@v1.2.0/mod.ts';
import {
    getRandomInt,
    getText,
    removeBotName,
    resolveEnv,
    sliceMessage,
} from './lib/helpers.ts';
import {
    Message,
    Update,
} from 'https://deno.land/x/grammy@v1.14.1/types.deno.ts';
import {
    ChatMessage,
    getChat,
    loadMemory,
    Memory,
    saveMemory,
} from './lib/memory.ts';
import logger from './lib/logger.ts';

// TODO: move this chit to config
const NAMES = [
    'слюша',
    'шлюша',
    'слюща',
    'союша',
    'slusha',
    'ck\\.if',
    'слбша',
    'слюшенция',
    'слюшка',
    'шлюшка',
    'слюшенька',
    'слюшечка',
    'слюшунчик',
    'слюшаня',
    '@slchat_bot',
];

const tendToReply = [
    'лучшая девочка',
    'лучший бот',
    'AI',
];

const nepons = [
    'непон.. попробуй перефразировать',
    'я непон тебя',
    'нехочу отвечать щас чето',
    'подумаю, может потом тебе скажу',
];

const tendToIgnore = [
    'ор+',
    'ору+',
    '(ха)+',
    'а(пх)+',
    'сука+',
    'сук',
    'ло+л',
    'еба+ть',
    'бля+ть',
    'пон.*',
    'хорошо',
    'гуд',
    'норм.*',
    'ок',
    'ok',
    'кек',
    'ок.*',
    'лан',
    'ладно',
    'спс',
    'да',
    'согласен',
    'согласна',
    'база',
    'реально',
    '/q',
    '\\[Sticker.*\\]$',
];

const memory: Memory = await loadMemory();
const env = resolveEnv();

let makingNotes = false;

interface RequestInfo {
    isRandom: boolean;
}

type MyContext = Context & {
    info: RequestInfo;
};

const bot = new Bot<MyContext>(env.botToken);

const Api = new AIApi(
    env.AI.url,
    env.AI.prompt,
    env.AI.model,
    env.AI.token,
);
bot.catch((error) => logger.error(error));

bot.on('message', async (ctx, next) => {
    const chat = getChat(
        memory,
        ctx.chat.id,
        ctx.chat.type,
    );
    const message = handleMessage(ctx.msg);
    if (!message) return;

    const history = chat.history;

    // Make sure history is not too long
    while (history.length > 80) {
        history.shift();
    }

    history.push(message);

    chat.history = history;

    // Save memory every 20 messages
    if (memory.unsavedMsgsCount > 20) {
        try {
            await saveMemory(memory);
        } catch (error) {
            throw new Werror(error, 'Saving memory');
        }

        memory.unsavedMsgsCount = 0;

        logger.info('Memory saved');
    } else {
        memory.unsavedMsgsCount++;
    }

    ctx.info = { isRandom: false };

    await next();
});

bot.command('start', (ctx) => ctx.reply('Привет! Я Слюша, бот-гений.'));

// Make summary and notes every X messages
bot.on('message', async (ctx, next) => {
    const chat = getChat(
        memory,
        ctx.chat.id,
        ctx.chat.type,
    );

    const usedDaysAgo = (Date.now() - chat.lastUse) / 1000 / 60 / 60 / 24;

    // Make less notes if bot is not used often
    let frequency = 80;
    if (usedDaysAgo > 2) {
        frequency = usedDaysAgo ** 2 * 20;
    }

    if (chat.lastNotes < frequency || makingNotes) {
        chat.lastNotes++;
        await next();
        return;
    }

    const makeNotes = async () => {
        makingNotes = true;

        const historyPortion = chat.history.slice(-80);

        const start = Date.now();
        try {
            const notes = await Api.makeNotes(historyPortion);
            chat.notes.push(notes);
            chat.lastNotes = 0;
        } catch (error) {
            logger.error('Could not make notes', error);
        }
        logger.info('Notes made in', (Date.now() - start) / 1000, 'seconds');

        // Keep only 10 notes
        while (chat.notes.length > 20) {
            chat.notes.shift();
        }

        makingNotes = false;
    };

    void makeNotes();

    await next();
});

bot.command('summary', async (ctx) => {
    const chat = getChat(
        memory,
        ctx.chat.id,
        ctx.chat.type,
    );

    if (chat.notes.length === 0) {
        await ctx.reply('Рановато еще, надо накопить больше сообщений', {
            reply_to_message_id: ctx.msg?.message_id,
        });
        return;
    }

    const response = chat.notes.slice(-2).join('\n');

    logger.info('/summary', response);

    await replyWithMarkdown(ctx, response);

    chat.history.push({
        sender: {
            id: bot.botInfo.id,
            name: bot.botInfo.first_name,
            username: bot.botInfo.username,
            myself: true,
        },
        date: Date.now(),
        text: response,
        isSummary: true,
    });

    chat.lastUse = Date.now();
});

bot.on('message', async (ctx, next) => {
    const message = handleMessage(ctx.msg);
    if (!message) return;

    const chat = getChat(
        memory,
        ctx.chat.id,
        ctx.chat.type,
    );

    const mustReply = shouldReply(
        chat,
        message.text,
        message.replyTo?.sender.id,
        ctx.chat.type,
        message.replyTo?.id,
    );
    const randomReply = getRandomInt(0, 100) > 100 - env.randomReply;

    const typer = new Typer(ctx);
    if (mustReply || randomReply) void typer.type();

    if (randomReply) {
        ctx.info.isRandom = true;
        logger.info('Random reply');
        await next();
    } else if (mustReply) {
        queue();
    }

    typer.stop();

    // Queue messages from single user, to avoid spam and answer more human-like
    function queue() {
        setTimeout(async () => {
            const userMsg = chat.history.filter((el) =>
                el.sender.id === ctx.msg.from.id
            );

            const lastUserMsg = userMsg.reduce((prev, current) =>
                current.date > prev.date ? current : prev
            );

            const laterMustReply = userMsg.find((el) =>
                shouldReply(
                    chat,
                    el.text,
                    el.replyTo?.sender.id,
                    ctx.chat.type,
                    el.replyTo?.isSummary,
                ) &&
                el.date > ctx.msg.date
            );

            // TODO: Implement per-chat rate-limiting

            // Skipping, because will reply later anyway
            if (laterMustReply) {
                typer.stop();
                logger.info(
                    'Skipping message, will reply later anyway',
                    message?.text,
                );
                return;
            }

            // Waiting another x seconds to check if user finished
            if (
                mustReply &&
                lastUserMsg.date > ctx.msg.date &&
                ((Date.now() / 1000 - lastUserMsg.date) < 3)
            ) {
                logger.info(
                    'User is typing, waiting for the message to be sent',
                );
                queue();
                return;
            }

            if (mustReply) {
                logger.info('Must reply', message?.text);
                try {
                    await next();
                } catch (error) {
                    // Must handle error here, because queue runs without await
                    console.log(error);
                    typer.stop();
                    return;
                }
            } else {
                logger.info(
                    'No reply, no if was triggered, skipping',
                    message?.text,
                    lastUserMsg.text,
                    ctx.msg.date > lastUserMsg.date,
                    (Date.now() / 1000 - lastUserMsg.date) < 3,
                    mustReply,
                    'mustReply',
                );
            }
        }, 4000);
    }
});

bot.use(limit(
    {
        // Allow only 2 messages to be handled every 5 seconds.
        timeFrame: 5000,
        limit: 2,

        // This is called when the limit is exceeded.
        onLimitExceeded: () => {
            logger.warn('Rate limit exceeded');
        },

        keyGenerator: (ctx) => {
            if (ctx.hasChatType(['group', 'supergroup'])) {
                return ctx.chat.id.toString();
            }

            return ctx.from?.id.toString();
        },
    },
));

bot.on('message', async (ctx) => {
    const message = handleMessage(ctx.msg);
    if (!message) return;

    const chat = getChat(
        memory,
        ctx.chat.id,
        ctx.chat.type,
    );
    const history = chat.history;

    let response: string | undefined;
    let error;

    const lastNote = chat.notes.slice(-4).join('\n');

    const time = new Date().getTime();
    for (let i = 0; i < 2; i++) {
        try {
            response = await Api.chatReply(
                history,
                lastNote,
            );
            break;
        } catch (err) {
            error = err;
            await delay(7000);
        }
    }
    logger.info('Time to get response:', (new Date().getTime() - time) / 1000);

    if (!response) {
        if (!ctx.info.isRandom) {
            logger.error('Unable to get response: ', error);

            if (error instanceof Error) {
                if (error.message === 'Safety violation detected in response') {
                    await ctx.reply('Хочется тебя оскорбить, но я не могу', {
                        reply_to_message_id: ctx.msg.message_id,
                    });
                    return;
                }
                if (
                    error.message === 'No response candidates received from api'
                ) {
                    await ctx.reply('Извини, я не понял тебя', {
                        reply_to_message_id: ctx.msg.message_id,
                    });
                    return;
                }
            }

            const idk = nepons[Math.floor(Math.random() * nepons.length)];
            await ctx.reply(idk, {
                reply_to_message_id: ctx.msg.message_id,
            });
        }

        return;
    }

    response = removeBotName(
        response,
        bot.botInfo.first_name,
        bot.botInfo.username,
    );
    response = response.replace(
        /([\u2700-\u27BF]|[\uE000-\uF8FF]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|[\u2011-\u26FF]|\uD83E[\uDD10-\uDDFF])/g,
        '',
    );
    response = response.replace(/\s+/g, ' ');
    response = response.replace(/^\(in reply.+?\)/gi, '');

    logger.info(`Response: "${response}"`);

    let res;
    try {
        res = await replyWithMarkdown(ctx, response);
    } catch (error) {
        throw new Werror(error, 'could not reply to user');
    }

    history.push({
        id: res.message_id,
        sender: {
            id: bot.botInfo.id,
            name: bot.botInfo.first_name,
            username: bot.botInfo.username,
            myself: true,
        },
        date: res.date,
        text: response.replace(/[\n\r]/g, ' '),
        isSummary: false,
    });

    chat.history = history;
    chat.lastUse = Date.now();
});

void bot.start({ drop_pending_updates: false });

function handleMessage(
    msg: Message & Update.NonChannel,
): ChatMessage | undefined {
    const text = getText(msg, bot.botInfo.id);

    if (!text) return;

    let replyTo: ChatMessage['replyTo'] | undefined;
    const reply = msg.reply_to_message;

    if (reply?.from && (reply.caption || reply.text || reply.sticker)) {
        const replyText = getText(reply, bot.botInfo.id);

        if (replyText) {
            replyTo = {
                sender: {
                    id: reply.from.id,
                    name: reply.from.first_name,
                    username: reply.from.username,
                },
                text: replyText,
            };
        }
    }

    return {
        id: msg.message_id,
        sender: {
            id: msg.from.id,
            name: msg.from.first_name,
            username: msg.from.username,
        },
        replyTo,
        date: msg.date,
        text,
        isSummary: false,
    };
}

function shouldReply(
    chat: Chat,
    text: string,
    replyFromId: number | undefined,
    chatType: string,
    replyToId: number | undefined,
): boolean {
    const direct =
        // Message reply
        replyFromId === bot.botInfo.id ||
        // Mentioned name
        new RegExp(`(${NAMES.join('|')})`, 'gmi').test(text) ||
        // PM
        chatType === 'private';

    const interested =
        // Messages with some special text
        new RegExp(`(${tendToReply.join('|')})`, 'gmi').test(text) &&
        getRandomInt(0, 100) > 100 - 30;

    const ignored = (
        // Short message with boring text
        text?.length < 30 &&
        new RegExp(`^(${tendToIgnore.join('|')})`, 'gmi').test(text) &&
        getRandomInt(0, 100) > 100 - 10
    )

    logger.info(
        `Deciding on reply "${
            sliceMessage(text, 20)
        }": Direct: ${direct}, Interested: ${interested}, Ignored: ${ignored}`,
    );

    if (direct && !ignored) {
        return true;
    }

    return interested && !ignored;
}

class Typer {
    ctx: Context;
    stopped = false;

    constructor(ctx: Context) {
        this.ctx = ctx;
    }

    async type() {
        const timeout = 1000 * 60;
        const secondsToWait = 5 * 1000;

        let time = 0;

        while (!this.stopped && time < timeout) {
            try {
                await this.ctx.replyWithChatAction('typing');
            } catch (_) {
                continue;
            }
            await delay(secondsToWait);
            time += secondsToWait;
        }
    }

    stop() {
        this.stopped = true;
    }
}

async function replyWithMarkdown(ctx: Context, text: string) {
    let res;
    try {
        res = await ctx.reply(text, {
            // reply_to_message_id: ctx.msg?.message_id,
            parse_mode: 'Markdown',
        });
    } catch (_) { // Retry without markdown
        res = await ctx.reply(text, {
            // reply_to_message_id: ctx.msg?.message_id,
        });
    }
    return res;
}

Deno.addSignalListener('SIGINT', async () => {
    try {
        await saveMemory(memory);
        logger.info('Memory saved on exit');
    } catch (error) {
        throw new Werror(error, 'Saving memory on exit');
    } finally {
        Deno.exit();
    }
});
