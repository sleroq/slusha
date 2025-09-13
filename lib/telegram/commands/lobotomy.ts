import { SlushaContext } from '../setup-bot.ts';
import { Composer } from 'grammy';

const bot = new Composer<SlushaContext>();

bot.command('lobotomy', async (ctx) => {
    if (ctx.chat.type !== 'private') {
        const admins = await ctx.getChatAdministrators();
        if (!admins.some((a) => a.user.id === ctx.from?.id)) {
            return ctx.reply(ctx.t('admin-only'));
        }
    }

    ctx.m.clear();
    ctx.m.getChat().notes = [];
    ctx.m.getChat().memory = undefined;
    await ctx.reply(ctx.t('history-cleared'));
});

export default bot;
