import { SlushaContext } from '../setup-bot.ts';
import { Composer } from 'grammy';
import logger from '../../logger.ts';

const bot = new Composer<SlushaContext>();

bot.command('lobotomy', async (ctx) => {
    const userId = ctx.from?.id;
    if (userId === undefined) return ctx.reply(ctx.t('admin-only'));
    if (!ctx.globalRoles.has('bot_admin') && ctx.chat.type !== 'private') {
        let isAdmin = false;
        try {
            const member = await ctx.api.getChatMember(
                ctx.chat.id,
                userId,
            );
            isAdmin = member.status === 'administrator' ||
                member.status === 'creator';
        } catch (error) {
            logger.warn('Could not check chat admin for /lobotomy', error);
        }
        if (!isAdmin) {
            return ctx.reply(ctx.t('admin-only'));
        }
    }

    await ctx.messages.clear();
    await ctx.reply(ctx.t('history-cleared'));
});

export default bot;
