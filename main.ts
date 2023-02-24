import { Bot } from 'https://deno.land/x/grammy@v1.14.1/mod.ts';
import ask from './ai-api.ts';
import Werror from './lib/werror.ts';
import { delay } from 'https://deno.land/std@0.177.0/async/mod.ts';

const token = Deno.env.get('BOT_TOKEN');
if (!token)
    throw new Error('BOT_TOKEN env is not set')

const CONTEXT_LIMIT = 8;
const CONTEXT_RELEVANCE = 5; // In minutes
const RETRIES = 2;
const RANDOM_REPLY = 4; // Percentage of messages bot will reply by itself
const CREATOR = '@sleroq labs';
const NAMES = [
    'слерок',
    'слюша',
    'шлюша',
    'sleeper',
    'слипер',
    'sleroq',
    'слиперок',
    'sleeper',
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
    '+',
    '/q',
]

interface ChatMessage {
    sender: string;
    date: number;
    text: string;
}
interface TalkContext {
    [key: string]: ChatMessage[];
}

const chats: TalkContext = {};

const bot = new Bot(token);

bot.catch(error => console.log(error));

bot.command('start', ctx => ctx.reply('Привет! Я Слюша, бот-гений.'));

bot.on('message', async ctx => {
    let text = await ctx.msg.text;
    if (!text) { return; }
    if (text.length > 160) { text = text.slice(0, 177) + '...'; }

    let history = chats[ctx.chat.id] || [];

    // Filter out irrelevant messages
    history = history.filter(el => new Date().getDate() - el.date < CONTEXT_RELEVANCE * 60 * 1000);

    // Save received message
    let message: ChatMessage = {
        sender: ctx.msg.from.first_name,
        date: ctx.msg.date,
        text,
    }

    // Make sure history not too long
    while (history.length > CONTEXT_LIMIT - 1) {
        history.shift();
    }

    const direct = ctx.msg.reply_to_message?.from?.id === bot.botInfo.id
        || text.match(new RegExp(NAMES.join('|'), 'gmi'))
        || ctx.chat.id === ctx.from.id;
    const random = getRandomInt(0, 100) > 100 - RANDOM_REPLY;
    const ignored = text.length < 10
        && text.match(new RegExp(`^(${tendToIgnore.join('|')})`, 'gmi'))
        && getRandomInt(0, 100) > 30;


    let reply: ChatMessage | undefined;

    if ((direct || random) && !ignored) {
        let context = '';
        let response = '';
        void typing()

        // Construct context
        history.forEach(m => {
            context += `${m.sender}:\n> ${m.text}\n`;
        });

        // Create final prompt
        let prompt = `${context}\n`;
        let replied = await ctx.msg.reply_to_message?.text;
        if (replied && history[history.length - 1]?.text != replied) {
            prompt += `${ctx.msg.reply_to_message?.from?.first_name || 'user' }:\n> **${replied}**\n`;
        }
        prompt += `${message.sender}:\n> **${text}**`;

        console.log('prompt: ' + prompt);

        let error;

        for (let i=0; i<RETRIES; i++) {
            try {
                response = await ask(prompt);
                break;
            } catch (err) {
                error = err;
                await delay(2000);
            }
        }

        if (!response) {
            if (!random && text.endsWith('?')) {
                let idk = nepons[Math.floor(Math.random() * nepons.length)];
                await ctx.reply(idk, {
                    reply_to_message_id: ctx.msg.message_id,
                });
            }
            throw new Werror(error);
        }

        response = response.replaceAll(/you\.com/gmi, CREATOR);
        response = response.replaceAll(/youchat/gmi, CREATOR);
        response = response.replaceAll(/youbot/gmi, CREATOR);
        response = response.trim().replaceAll(/^> /gmi, '');

        console.log('reply: ' + response);

        let res;
        try {
            res = await ctx.reply(response, {
                reply_to_message_id: ctx.msg.message_id,
                parse_mode: 'Markdown',
            });
        } catch (err) { // Retry without markdown
            res = await ctx.reply(response, {
                reply_to_message_id: ctx.msg.message_id,
            });
        }

        reply = {
            sender: bot.botInfo.first_name,
            date: res.date,
            text: response,
        }

        async function typing() {
            let i = 0;
            while (!response && i < 4) {
                try {
                    await ctx.replyWithChatAction('typing');
                } catch (err) {
                    break;
                }
                await delay(5000);
                i++;
            }
        }

    }

    history.push(message);
    if (reply) {
        history.push(reply);
    }

    chats[ctx.chat.id] = history;
});

function getRandomInt(min: number, max: number) {
    min = Math.ceil(min);
    max = Math.floor(max);
    return Math.floor(Math.random() * (max - min) + min); // The maximum is exclusive and the minimum is inclusive
}

void bot.start();
