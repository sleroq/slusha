import { SlushaContext } from '../setup-bot.ts';
import { Composer } from 'grammy';
import { Config } from '../../config.ts';
import { replyWithMarkdown } from '../helpers.ts';

export function registerRandom(
    composer: Composer<SlushaContext>,
    config: Config,
) {
    composer.command('random', async (ctx) => {
        const args = ctx.msg.text
            .split(' ')
            .map((arg) => arg.trim())
            .filter((arg) => arg !== '');

        const currentValue = ctx.m.getChat().randomReplyProbability ??
            config.randomReplyProbability;

        if (args.length === 1) {
            return replyWithMarkdown(
                ctx,
                ctx.t('random-help', { currentValue }),
            );
        }

        if (ctx.chat.type !== 'private') {
            const admins = await ctx.getChatAdministrators();
            if (!admins.some((a) => a.user.id === ctx.from?.id)) {
                return ctx.reply(ctx.t('random-admin-only'));
            }
        }

        const newValue = args[1];
        if (newValue === 'default') {
            ctx.m.getChat().randomReplyProbability = undefined;
            return ctx.reply(ctx.t('random-updated'));
        }

        const probability = parseFloat(newValue);
        if (isNaN(probability) || probability < 0 || probability > 50) {
            return ctx.reply(ctx.t('random-parse-error'));
        }

        ctx.m.getChat().randomReplyProbability = probability;
        return ctx.reply(ctx.t('random-set', { probability }));
    });
}
