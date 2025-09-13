import { SlushaContext } from '../setup-bot.ts';
import { Composer } from 'grammy';
import { Config } from '../../config.ts';

export function registerModel(
    composer: Composer<SlushaContext>,
    config: Config,
) {
    composer.command('model', (ctx) => {
        if (
            !config.adminIds || !ctx.msg.from ||
            !config.adminIds.includes(ctx.msg.from.id)
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
                    model: ctx.m.getChat().chatModel ?? config.ai.model,
                }),
            );
        }

        const newModel = args[1];
        if (newModel === 'default') {
            ctx.m.getChat().chatModel = undefined;
            return ctx.reply(ctx.t('model-reset'));
        }

        ctx.m.getChat().chatModel = newModel;
        return ctx.reply(ctx.t('model-set', { model: newModel }));
    });
}
