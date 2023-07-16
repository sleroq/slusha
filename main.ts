import { Bot, Context } from 'https://deno.land/x/grammy@v1.14.1/mod.ts';
import AIApi, { RequestMessage } from './ai-api.ts';
import Werror from './lib/werror.ts';
import { delay } from 'https://deno.land/std@0.177.0/async/mod.ts';
import { assembleHistory, getRandomInt, resolveEnv } from './lib/helpers.ts';
import {
    Chat,
    Message,
    Update,
} from 'https://deno.land/x/grammy@v1.14.1/types.deno.ts';
import Logger from 'https://deno.land/x/logger@v1.1.1/logger.ts';
const logger = new Logger();
await logger.initFileLogger('log', { rotate: true });

const NAMES = [
    'слюша',
    'шлюша',
    'слюща',
    'союша',
    'слбша',
];
const tendToReply = [
    'sleeper',
    'слипер',
    'sleroq',
    'слиперок',
    'sleeper',
    'слерок',
    'бот',
    'ботик',
    'лучшая девочка',
];
const nepons = [
    'непон.. попробуй перефразировать',
    'я непон тебя',
    'нехочу отвечать щас чето',
    'подумаю, может потом тебе скажу',
];
const tendToIgnore = [
    'ор',
    'ору',
    'ха',
    'лол',
    'ебать',
    'пон',
    'хорошо',
    'ок',
    'лан',
    'спс',
    'да',
    'согласен',
    'база',
    '/q',
];
interface Sender {
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
interface Memory {
    [key: string]: {
        notes: string;
        lastNotes: number;
        history: ChatMessage[];
    };
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
const bot = new Bot(env.botToken);

const Api = new AIApi(
    env.AI.url,
    env.AI.prompt,
    env.AI.model,
    env.AI.token,
);

bot.catch((error) => logger.error(error));
bot.command('start', (ctx) => ctx.reply('Привет! Я Слюша, бот-гений.'));

// Returns chat data, creates new one if it does not exist
function getChat(m: Memory, chatId: number, msgId: number) {
    let chat = chats[chatId];

    if (!chats[chatId]) {
        chat = {
            notes: '',
            lastNotes: msgId,
            history: [],
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
        ]);
    } catch (error) {
        throw new Werror(error, 'Taking notes');
    }

    return newNotes || notes;
}

bot.on('message', async (ctx) => {
    const message = handleMessage(ctx.msg);
    if (!message) return;

    const chat = getChat(chats, ctx.chat.id, ctx.msg.message_id);

    let history = chats[ctx.chat.id]?.history || [];
    history.push(message);

    // Filter out irrelevant messages
    history = history.filter((el) =>
        new Date().getDate() - el.date < env.contextTimeout * 60 * 1000
    );

    // Make sure history is not too long
    while (history.length > env.contextLimit) {
        history.shift();
    }

    let botReply: ChatMessage | undefined;

    const mustReply = shouldReply(message.text, ctx.msg, ctx.chat);
    const randomReply = getRandomInt(0, 100) > 100 - env.randomReply;

    if (mustReply || randomReply) {
        let response: string | undefined;
        void Typer.type(ctx);

        const messages: RequestMessage[] = assembleHistory(history);

        // Each time we add 2 messages to history.
        // If contextLimit is not even, we should account to that
        const shouldGenSummary = ctx.msg.message_id - chat.lastNotes > env.contextLimit;

        if (shouldGenSummary && env.AI.notesPrompt) {
            logger.info('generating notes')

            try {
                chat.notes = await genNotes(
                    chat.notes,
                    messages,
                    env.AI.notesPrompt,
                );
                chat.lastNotes = ctx.msg.message_id;
            } catch (error) {
                logger.warn('Unable to take notes this time :(');
            }

            logger.info('Chat notes:', chat.notes);

            try {
                const jsonData = JSON.stringify(chats, null, 2); // Convert JSON object to a string with formatting
                await Deno.writeTextFile('memory.json', jsonData);
            } catch (error) {
                logger.warn('Unable to save memory :(');
            }
        }

        // Final system prompt
        const prompt =
            `Write your reply only to last message from ${message.sender.name} (@${message.sender.username}). ` +
            env.AI.finalPrompt;

        let error;
        for (let i = 0; i < 2; i++) {
            try {
                response = await Api.chatReply(
                    prompt,
                    messages,
                    chat.notes,
                );
                break;
            } catch (err) {
                error = err;
                await delay(2000);
            }
        }

        if (!response) {
            Typer.stop();

            if (!randomReply) {
                const idk = nepons[Math.floor(Math.random() * nepons.length)];
                await ctx.reply(idk, {
                    reply_to_message_id: ctx.msg.message_id,
                });
            }
            throw new Werror(error);
        }

        Typer.stop();

        // Remove bot's name from the beginning of the reply
        response = response.trim().replaceAll(/^.+\(@\w+\):/gm, '');
        response = response.trim().replaceAll(/^Слюша:/gm, '');

        logger.info('last msg: ', message.text);
        logger.info('reply: ' + response);

        let res;
        try {
            res = await ctx.reply(response, {
                reply_to_message_id: ctx.msg.message_id,
                parse_mode: 'Markdown',
            });
        } catch (_) { // Retry without markdown
            res = await ctx.reply(response, {
                reply_to_message_id: ctx.msg.message_id,
            });
        }

        botReply = {
            sender: {
                name: bot.botInfo.first_name,
                username: bot.botInfo.username,
                myself: true,
            },
            replyTo: message,
            date: res.date,
            text: response,
        };
        history.push(botReply);
    }

    chat.history = history;
});

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
                name: reply.from.first_name,
                username: reply.from.username,
            },
            text,
        };
    }

    return {
        sender: {
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
    msg: Message & Update.NonChannel,
    chat: Chat.PrivateChat | Chat.GroupChat | Chat.SupergroupChat,
): boolean {
    const direct =
        // Message reply
        msg.reply_to_message?.from?.id === bot.botInfo.id ||
        // Mentioned name
        text.match(new RegExp(NAMES.join('|'), 'gmi')) ||
        // PM
        chat.type == 'private';

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
    static stopped = false;

    static async type(ctx: Context) {
        const timeout = 1000 * 60;
        const secondsToWait = 5 * 1000;

        let time = 0;

        while (!this.stopped && time < timeout) {
            try {
                await ctx.replyWithChatAction('typing');
            } catch (_) {
                break;
            }
            await delay(secondsToWait);
            time += secondsToWait;
        }
    }

    static stop() {
        this.stopped = true;
    }
}

void bot.start({ drop_pending_updates: true });
