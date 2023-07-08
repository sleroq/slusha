import { Bot, Context } from 'https://deno.land/x/grammy@v1.14.1/mod.ts';
import AIApi from './ai-api.ts';
import Werror from './lib/werror.ts';
import { delay } from 'https://deno.land/std@0.177.0/async/mod.ts';
import { getRandomInt, resolveEnv } from './helpers.ts';
import { Chat, Message, Update } from "https://deno.land/x/grammy@v1.14.1/types.deno.ts";

const token = Deno.env.get('BOT_TOKEN');
if (!token) {
    throw new Error('BOT_TOKEN env is not set');
}

const CONTEXT_LIMIT = 50;
const CONTEXT_RELEVANCE = 50; // In minutes
const RETRIES = 2;
const RANDOM_REPLY = 1; // Percentage of messages bot will reply by itself

const NAMES = [
    'слюша',
    'шлюша',
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
interface TalkContext {
    [key: string]: ChatMessage[];
}

const chats: TalkContext = {};

const bot = new Bot(token);

const environment = resolveEnv()
const Api = new AIApi(
    environment.url,
    environment.prompt,
    environment.model,
    environment.token
);

bot.catch((error) => console.log(error));
bot.command('start', (ctx) => ctx.reply('Привет! Я Слюша, бот-гений.'));

bot.on('message', async (ctx) => {
    const message = handleMessage(ctx.msg);
    if (!message) return;

    let history = chats[ctx.chat.id] || [];
    history.push(message);

    // Filter out irrelevant messages
    history = history.filter((el) =>
        new Date().getDate() - el.date < CONTEXT_RELEVANCE * 60 * 1000
    );

    // Make sure history is not too long
    while (history.length > CONTEXT_LIMIT - 1) {
        history.shift();
    }

    let botReply: ChatMessage | undefined;

    const mustReply = shouldReply(message.text, ctx.msg, ctx.chat);
    const randomReply = getRandomInt(0, 100) > 100 - RANDOM_REPLY;

    if (mustReply || randomReply) {
        let response: string | undefined;
        Typer.type(ctx);

        // Final system prompt
        const prompt =
            `Write your reply only to message from ${message.sender.name} (@${message.sender.username})`;

        let error;
        for (let i = 0; i < RETRIES; i++) {
            try {
                response = await Api.ask(prompt, history);
                break;
            } catch (err) {
                error = err;
                await delay(2000);
            }
        }

        if (!response) {
            Typer.stop()

            if (!randomReply) {
                const idk = nepons[Math.floor(Math.random() * nepons.length)];
                await ctx.reply(idk, {
                    reply_to_message_id: ctx.msg.message_id,
                });
            }
            throw new Werror(error);
        }

        Typer.stop()

        // Remove bot's name from the beginning of the reply
        response = response.trim().replaceAll(/^.+\(@\w+\):/gm, '');

        console.log('reply: ' + response);

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

    chats[ctx.chat.id] = history;
});

function handleMessage(msg: Message & Update.NonChannel): ChatMessage | undefined {
    let { text } = msg;
    if (!text && msg.sticker) {
        text = 'Sticker ' + msg.sticker.emoji;
    }

    if (!text) return;

    // Slice long messages, which are too long
    if (text.length > 500) text = text.slice(0, 497) + '...';

    let replyTo: ChatMessage["replyTo"] | undefined;
    const reply = msg.reply_to_message;

    if (reply?.from && (reply.caption || reply.text || reply.sticker?.emoji)) {
        const text = reply.caption
            || reply.text
            || `Sticker ${reply.sticker?.emoji}`;

        replyTo = {
            sender: {
                name: reply.from.first_name,
                username: reply.from.username,
            },
            text,
        };
    }

    const message: ChatMessage = {
        sender: {
            name: msg.from.first_name,
            username: msg.from.username,
        },
        replyTo,
        date: msg.date,
        text,
    };

    return message;
}

function shouldReply(text: string, msg: Message & Update.NonChannel, chat: Chat.PrivateChat | Chat.GroupChat | Chat.SupergroupChat): boolean {
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

    const formula = (direct || interested) && !ignored

    return Boolean(formula)
}


class Typer {
    static stopped = false

    static async type(ctx: Context) {
        const timeout = 1 * 1000 * 60;
        const secondsToWait = 5 * 1000

        let time = 0

        while (!this.stopped && time < timeout) {
            try {
                await ctx.replyWithChatAction('typing');
            } catch (_) {
                break;
            }
            await delay(secondsToWait);
            time += secondsToWait
        }
    }

    static stop() {
        this.stopped = true;
    }
}

void bot.start();
