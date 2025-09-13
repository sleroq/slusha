import { SlushaContext } from '../setup-bot.ts';
import { Composer } from 'grammy';

export default function registerHateMode(composer: Composer<SlushaContext>) {
    composer.command('hatemode', async (ctx) => {
        if (ctx.chat.type !== 'private') {
            const admins = await ctx.getChatAdministrators();
            if (!admins.some((a) => a.user.id === ctx.from?.id)) {
                return ctx.reply(
                    ctx.t('hate-mode-msg', {
                        status: ctx.m.getChat().hateMode
                            ? ctx.t('enabled')
                            : ctx.t('disabled'),
                    }),
                );
            }
        }

        ctx.m.getChat().hateMode = !ctx.m.getChat().hateMode;

        return ctx.reply(
            ctx.t('hate-mode-status', {
                status: ctx.m.getChat().hateMode
                    ? ctx.t('enabled')
                    : ctx.t('disabled'),
            }),
        );
    });
}
