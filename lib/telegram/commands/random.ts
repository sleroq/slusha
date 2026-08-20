import { SlushaContext } from '../setup-bot.ts';
import { Composer } from 'grammy';
import { getGlobalUserConfig } from '../../config.ts';
import { replyWithMarkdown } from '../helpers.ts';
import { canAccessConfig } from '../../config-access.ts';

export function registerRandom(
    composer: Composer<SlushaContext>,
) {
    composer.command('random', async (ctx) => {
        if (
            !canAccessConfig('randomReplyProbability', 'global', 'read', {
                globalRoles: ctx.globalRoles,
            })
        ) {
            return ctx.reply(ctx.t('admin-only'));
        }
        const globalConfig = await getGlobalUserConfig(ctx.db);
        const currentValue = globalConfig.randomReplyProbability;

        return replyWithMarkdown(
            ctx,
            ctx.t('random-help', { currentValue }),
        );
    });
}
