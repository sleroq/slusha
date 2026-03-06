import { SlushaContext } from '../setup-bot.ts';
import { Composer } from 'grammy';

export default function registerHateMode(composer: Composer<SlushaContext>) {
    composer.command('hatemode', async (ctx) => {
        const chat = await ctx.m.getChat();
        if (ctx.chat.type !== 'private') {
            const admins = await ctx.getChatAdministrators();
            if (!admins.some((a) => a.user.id === ctx.from?.id)) {
                return ctx.reply(
                    ctx.t('hate-mode-msg', {
                        status: chat.hateMode
                            ? ctx.t('enabled')
                            : ctx.t('disabled'),
                    }),
                );
            }
        }

        const nextMode = !chat.hateMode;
        await ctx.m.setHateMode(nextMode);

        return ctx.reply(
            ctx.t('hate-mode-status', {
                status: nextMode ? ctx.t('enabled') : ctx.t('disabled'),
            }),
        );
    });
}
