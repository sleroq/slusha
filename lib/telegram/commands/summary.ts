import { SlushaContext } from '../setup-bot.ts';
import { Composer } from 'grammy';
import { getGlobalUserConfig } from '../../config.ts';

export function registerSummary(
    composer: Composer<SlushaContext>,
) {
    composer.command('summary', async (ctx) => {
        const globalConfig = await getGlobalUserConfig(ctx.memory.db);
        await ctx.m.setLastUse(Date.now());
        const notes = (await ctx.m.getChat()).notes.slice(
            -globalConfig.maxNotesToStore - 2,
        );

        if (notes.length === 0) {
            return ctx.reply(ctx.t('notes-too-few-messages'));
        }

        return ctx.reply(
            ctx.t('notes-output', {
                notes: notes.join('\n').replaceAll('\n\n', '\n'),
            }),
        );
    });
}
