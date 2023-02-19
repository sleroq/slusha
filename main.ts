import { Bot } from 'https://deno.land/x/grammy@v1.14.1/mod.ts';
import ask from "./ai-api.ts";

const token = Deno.env.get('BOT_TOKEN');
if (!token)
    throw new Error('BOT_TOKEN env is not set')

const bot = new Bot(token);

bot.command('start', (ctx) => ctx.reply('Welcome! Up and running.'));

bot.on('message', async (ctx) => {
    const msg = await ctx.msg.text;
    if (!msg) { return; }

    const random = Math.floor(Math.random() * 100) + 1;

    const names = [
        'сыл',
        'слерок',
        'слюша',
        'шлюша',
        'sleeper',
        'слипер',
        'sleroq',
        'слиперок',
        'sleeper',
        'sl',
    ];

    if (ctx.msg.reply_to_message?.from?.id === bot.botInfo.id
        || msg.match(new RegExp(names.join('|'), 'gmi'))
        || random > 90) {
        console.log(`- from ${ctx.from.first_name}`)
        const response = await ask(msg);
        await ctx.reply(response, {
            reply_to_message_id: ctx.msg.message_id,
        });
    }

});

void bot.start();
