import { SlushaContext } from '../setup-bot.ts';
import { Composer } from 'grammy';
import logger from '../../logger.ts';

export default function registerHateMode(composer: Composer<SlushaContext>) {
    composer.command('hatemode', async (ctx) => {
        const userId = ctx.from?.id;
        if (userId === undefined) return ctx.reply(ctx.t('admin-only'));
        const chat = await ctx.chats.getChat(ctx.chat);
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
                logger.warn('Could not check chat admin for /hatemode', error);
            }
            if (!isAdmin) {
                return ctx.reply(ctx.t('admin-only'));
            }
        }

        const nextMode = !chat.hateMode;
        await ctx.chats.patchChat(ctx.chat.id, { hateMode: nextMode });

        return ctx.reply(
            ctx.t('hate-mode-status', {
                status: nextMode ? ctx.t('enabled') : ctx.t('disabled'),
            }),
        );
    });
}
