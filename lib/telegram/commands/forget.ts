import { SlushaContext } from '../setup-bot.ts';
import { Composer } from 'grammy';

const bot = new Composer<SlushaContext>();

bot.command('forget', async (ctx) => {
    ctx.m.clear();
    await ctx.reply(ctx.t('history-cleared'));
});

export default bot;
