import { SlushaContext } from '../setup-bot.ts';
import { Composer } from 'grammy';
import { getGlobalUserConfig } from '../../config.ts';

export function registerModel(
    composer: Composer<SlushaContext>,
) {
    composer.command('model', async (ctx) => {
        const globalConfig = await getGlobalUserConfig(ctx.db);
        if (
            !globalConfig.adminIds || !ctx.msg.from ||
            !globalConfig.adminIds.includes(ctx.msg.from.id)
        ) {
            return ctx.reply(ctx.t('admin-only'));
        }

        return ctx.reply(
            ctx.t('model-current', {
                model: globalConfig.ai.model,
            }),
        );
    });
}
