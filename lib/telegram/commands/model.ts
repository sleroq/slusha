import { SlushaContext } from '../setup-bot.ts';
import { Composer } from 'grammy';
import { getGlobalUserConfig } from '../../config.ts';
import { canAccessConfig } from '../../config-access.ts';

export function registerModel(
    composer: Composer<SlushaContext>,
) {
    composer.command('model', async (ctx) => {
        if (
            !canAccessConfig('ai.model', 'global', 'read', {
                globalRoles: ctx.globalRoles,
            })
        ) {
            return ctx.reply(ctx.t('admin-only'));
        }
        const globalConfig = await getGlobalUserConfig(ctx.db);

        return ctx.reply(
            ctx.t('model-current', {
                model: globalConfig.ai.model,
            }),
        );
    });
}
