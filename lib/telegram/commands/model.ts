import { SlushaContext } from '../setup-bot.ts';
import { Composer } from 'grammy';
import { Config } from '../../config.ts';

export function registerModel(
    composer: Composer<SlushaContext>,
    config: Config,
) {
    composer.command('model', async (ctx) => {
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

        const chat = await ctx.m.getChat();

        if (args.length === 1) {
            return ctx.reply(
                ctx.t('model-current', {
                    model: chat.chatModel ?? config.ai.model,
                }),
            );
        }

        const newModel = args[1];
        if (newModel === 'default') {
            await ctx.m.setChatFields({ chatModel: null });
            return ctx.reply(ctx.t('model-reset'));
        }

        await ctx.m.setChatFields({ chatModel: newModel });
        return ctx.reply(ctx.t('model-set', { model: newModel }));
    });
}
