import { SlushaContext } from '../setup-bot.ts';
import { Composer } from 'grammy';
import { replyWithMarkdown } from '../helpers.ts';

const bot = new Composer<SlushaContext>();

bot.command('changelog', async (ctx) => {
    await replyWithMarkdown(
        ctx,
        '```js\n// TODO: написать что нового```\n\nМожешь пока чекнуть комиты что-ли - https://github.com/sleroq/slusha/commits/master',
    );
});

export default bot;
