import { Bot, Context } from 'https://deno.land/x/grammy@v1.14.1/mod.ts';
import AIApi, { RequestMessage } from './ai-api.ts';
import Werror from './lib/werror.ts';
import { delay } from 'https://deno.land/std@0.177.0/async/mod.ts';
import { limit } from 'https://deno.land/x/grammy_ratelimiter@v1.2.0/mod.ts';
import { assembleHistory, getRandomInt, resolveEnv } from './lib/helpers.ts';
import {
    Message,
    Update,
} from 'https://deno.land/x/grammy@v1.14.1/types.deno.ts';
import Logger from 'https://deno.land/x/logger@v1.1.1/logger.ts';

const logger = new Logger();
await logger.initFileLogger('log', { rotate: true });


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

interface Sender {
    id: number;
    name: string;
    username: string | undefined;
    myself?: boolean;
}

export interface ChatMessage {
    sender: Sender;
    replyTo?: {
        sender: Sender;
        text: string;
    };
    date: number;
    text: string;
}

interface Chat {
    notes: string;
    lastNotes: number;
    history: ChatMessage[];
    type: string;
}

interface Memory {
    [key: string]: Chat;
}

async function loadMemory() {
    let data;

    try {
        data = await Deno.readTextFile('memory.json');
    } catch (error) {
        logger.warn('reading memory: ', error);
        return;
    }

    let parsedData: Memory;
    try {
        parsedData = JSON.parse(data);
    } catch (error) {
        logger.warn('reading memory: ', error);
        return;
    }

    return parsedData;
}

const chats: Memory = await loadMemory() || {};
const env = resolveEnv();

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

bot.use(limit());
bot.catch((error) => logger.error(error));
bot.on('message', async (ctx, next) => {
    const chat = getChat(chats, ctx.chat.id, ctx.msg.message_id, ctx.chat.type);
    const message = handleMessage(ctx.msg);
    if (!message) return;

    let history = chat.history;
    history.push(message);

    // Filter out irrelevant messages
    history = history.filter((el) =>
        new Date().getDate() - el.date < env.contextTimeout * 60 * 1000
    );

    // Make sure history is not too long
    while (history.length > env.contextLimit) {
        history.shift();
    }

    chat.history = history;

    await next();
});

bot.command('start', (ctx) => ctx.reply('Привет! Я Слюша, бот-гений.'));

bot.command('summary', async (ctx) => {
    // Final system prompt
    const prompt = `
        !!Do not answer as Слюша!!.
        Just write a concise summary of all the events that have occurred in this chat in Russian language.
        Structure your response in a way that is easy to read, possibly with division into parts with new lines.
        Fit into 2000 characters
    `;

    const chat = getChat(chats, ctx.chat.id, ctx.msg.message_id, ctx.chat.type);
    const messages = assembleHistory(chat.history);

    let response;
    try {
        response = await Api.chatReply(
            prompt,
            messages,
            chat.notes,
            logger,
        );
    } catch (error) {
        await ctx.reply('Что-то у меня не получилось', {
            reply_to_message_id: ctx.msg.message_id,
        });
        throw new Werror(error, 'Getting summary from ai');
    }

    logger.info('/summary', response);

    return replyWithMarkdown(ctx, response);
});

bot.on('message', async (ctx, next) => {
    const message = handleMessage(ctx.msg);
    if (!message) return;

    const chat = getChat(chats, ctx.chat.id, ctx.msg.message_id, ctx.chat.type);

    // Skipping queue for long messages
    // Because they are more likely to be complete requests
    if (message.text.length > 35) {
        return next();
    }

    const mustReply = shouldReply(
        message.text,
        message.replyTo?.sender.id,
        ctx.chat.type,
    );
    const randomReply = getRandomInt(0, 100) > 100 - env.randomReply;

    const typer = new Typer(ctx);
    if (mustReply || randomReply) void typer.type();

    if (randomReply) {
        ctx.info.isRandom = true;
        await next();
    } else {
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
                shouldReply(el.text, el.replyTo?.sender.id, ctx.chat.type) &&
                el.date > ctx.msg.date
            );

            // Skipping, because will reply later anyway
            if (laterMustReply) {
                typer.stop();
                return;
            }

            // Waiting another x seconds to check if user finished
            if (
                mustReply &&
                lastUserMsg.date > ctx.msg.date &&
                ((Date.now() / 1000 - lastUserMsg.date) < 3)
            ) {
                queue();
                return;
            }
        }, 3000);
    }
});

async function makeNotes(
    chat: Chat,
    msgId: number,
    messages: RequestMessage[],
    prompt: string,
) {
    logger.info('generating notes');

    try {
        chat.notes = await genNotes(
            chat.notes,
            messages,
            prompt,
        );
    } catch (error) {
        throw new Werror(error, 'Taking notes');
    }

    logger.info('Chat notes:', chat.notes);

    chat.lastNotes = msgId;

    try {
        await saveMemory(chats);
    } catch (error) {
        throw new Werror(error, 'Saving memory');
    }
}

bot.on('message', async (ctx) => {
    const message = handleMessage(ctx.msg);
    if (!message) return;

    const chat = getChat(chats, ctx.chat.id, ctx.msg.message_id, ctx.chat.type);
    const history = chat.history;

    const messages: RequestMessage[] = assembleHistory(history);

    // Each time we add 2 messages to history.
    // If contextLimit is not even, we should account to that
    const shouldGenSummary =
        ctx.msg.message_id - chat.lastNotes > env.contextLimit;
    const summaryPrompt = env.AI.notesPrompt;

    if (shouldGenSummary && summaryPrompt) {
        try {
            await makeNotes(chat, ctx.msg.message_id, messages, summaryPrompt);
        } catch (error) {
            logger.warn('Unable to take notes', error);
        }
    }

    // Final system prompt
    const prompt = `
            Write your reply only to this message from ${message.sender.name} (@${message.sender.username}).
            > ${message.text}
            ${env.AI.finalPrompt}`;

    logger.info(prompt);

    let response: string | undefined;
    let error;
    for (let i = 0; i < 2; i++) {
        try {
            response = await Api.chatReply(
                prompt,
                messages,
                chat.notes,
                logger,
            );
            break;
        } catch (err) {
            error = err;
            await delay(2000);
        }
    }

    if (!response) {
        if (!ctx.info.isRandom) {
            const idk = nepons[Math.floor(Math.random() * nepons.length)];
            await ctx.reply(idk, {
                reply_to_message_id: ctx.msg.message_id,
            });
        }
        logger.error('Unable to get response: ', error);
        return;
    }

    // Remove bot's name from the beginning of the reply
    response = response.trim().replaceAll(/^.+\(@\w+\):/gm, '');
    response = response.trim().replaceAll(/^Слюша:/gm, '');

    logger.info('last msg: ', message.text);
    logger.info('reply: ' + response);

    let res;
    try {
        res = await replyWithMarkdown(ctx, response);
    } catch (error) {
        throw new Werror(error, 'could not reply to user');
    }

    history.push({
        sender: {
            id: bot.botInfo.id,
            name: bot.botInfo.first_name,
            username: bot.botInfo.username,
            myself: true,
        },
        replyTo: message,
        date: res.date,
        text: response,
    });

    chat.history = history;
});

void bot.start({ drop_pending_updates: false });

function handleMessage(
    msg: Message & Update.NonChannel,
): ChatMessage | undefined {
    let { text } = msg;
    if (!text && msg.sticker) {
        text = 'Sticker ' + msg.sticker.emoji;
    }

    if (!text) return;

    // Slice long messages, which are too long
    if (text.length > 800) text = text.slice(0, 797) + '...';

    let replyTo: ChatMessage['replyTo'] | undefined;
    const reply = msg.reply_to_message;

    if (reply?.from && (reply.caption || reply.text || reply.sticker?.emoji)) {
        const text = reply.caption ||
            reply.text ||
            `Sticker ${reply.sticker?.emoji}`;

        replyTo = {
            sender: {
                id: reply.from.id,
                name: reply.from.first_name,
                username: reply.from.username,
            },
            text,
        };
    }

    return {
        sender: {
            id: msg.from.id,
            name: msg.from.first_name,
            username: msg.from.username,
        },
        replyTo,
        date: msg.date,
        text,
    };
}

function shouldReply(
    text: string,
    replyFromId: number | undefined,
    chatType: string,
): boolean {
    const direct =
        // Message reply
        replyFromId === bot.botInfo.id ||
        // Mentioned name
        text.match(new RegExp(NAMES.join('|'), 'gmi')) ||
        // PM
        chatType === 'private';

    const interested =
        // Messages with some special text
        text.match(new RegExp(`(${tendToReply.join('|')})`, 'gmi')) &&
        getRandomInt(0, 100) > 100 - 30;

    const ignored =
        // Short message with boring text
        text.length < 10 &&
        text.match(new RegExp(`^(${tendToIgnore.join('|')})`, 'gmi')) &&
        getRandomInt(0, 100) > 100 - 80;

    const formula = (direct || interested) && !ignored;

    return Boolean(formula);
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

// Returns chat data, creates new one if it does not exist
function getChat(m: Memory, chatId: number, msgId: number, chatType: string) {
    let chat = chats[chatId];

    if (!chats[chatId]) {
        chat = {
            notes: '',
            lastNotes: msgId,
            history: [],
            type: chatType,
        };

        chats[chatId] = chat;
    }

    return chat;
}

async function genNotes(
    notes: string,
    messages: RequestMessage[],
    prompt: string,
): Promise<string> {
    if (notes !== '') {
        prompt +=
            `This is your previous notes. Some are important, you must use them while writing a new version: ${notes}`;
    }

    let newNotes;
    try {
        notes = await Api.ask([
            { role: 'system', content: env.AI.prompt },
            ...messages,
            { role: 'system', content: prompt },
        ], logger);
    } catch (error) {
        throw new Werror(error, 'Taking notes');
    }

    return newNotes || notes;
}

function saveMemory(chats: Memory) {
    const jsonData = JSON.stringify(chats, null, 2);

    return Deno.writeTextFile('memory.json', jsonData);
}

async function replyWithMarkdown(ctx: Context, text: string) {
    let res;
    try {
        res = await ctx.reply(text, {
            reply_to_message_id: ctx.msg?.message_id,
            parse_mode: 'Markdown',
        });
    } catch (_) { // Retry without markdown
        res = await ctx.reply(text, {
            reply_to_message_id: ctx.msg?.message_id,
        });
    }
    return res;
}
