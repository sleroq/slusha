import { SlushaContext } from '../setup-bot.ts';
import { Composer } from 'grammy';
import { getGlobalUserConfig } from '../../config.ts';

export function registerModel(
    composer: Composer<SlushaContext>,
) {
    composer.command('model', async (ctx) => {
        const globalConfig = await getGlobalUserConfig(ctx.memory.db);
        if (
            !globalConfig.adminIds || !ctx.msg.from ||
            !globalConfig.adminIds.includes(ctx.msg.from.id)
        ) {
            return ctx.reply(ctx.t('admin-only'));
        }

        const args = ctx.msg.text
            .split(' ')
            .map((arg) => arg.trim())
            .filter((arg) => arg !== '');

        if (args.length === 1) {
            return ctx.reply(
                ctx.t('model-current', {
                    model: (await ctx.m.getChat()).chatModel ??
                        globalConfig.ai.model,
                }),
            );
        }

        const newModel = args[1];
        if (newModel === 'default') {
            await ctx.m.setChatModel(undefined);
            return ctx.reply(ctx.t('model-reset'));
        }

        await ctx.m.setChatModel(newModel);
        return ctx.reply(ctx.t('model-set', { model: newModel }));
    });
}
