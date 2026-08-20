import { SlushaContext } from '../setup-bot.ts';
import { Composer } from 'grammy';

const bot = new Composer<SlushaContext>();

bot.command('forget', async (ctx) => {
    if (!ctx.globalRoles.has('bot_admin') && ctx.chat.type !== 'private') {
        const admins = await ctx.getChatAdministrators();
        if (!admins.some((admin) => admin.user.id === ctx.from?.id)) {
            return ctx.reply(ctx.t('admin-only'));
        }
    }

    await ctx.messages.clear();
    await ctx.reply(ctx.t('history-cleared'));
});

export default bot;
