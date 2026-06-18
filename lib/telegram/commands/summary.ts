import { SlushaContext } from '../setup-bot.ts';
import { Composer } from 'grammy';

export function registerSummary(
    composer: Composer<SlushaContext>,
) {
    composer.command('summary', async (ctx) => {
        await ctx.m.setLastUse(Date.now());
        return ctx.reply(ctx.t('summary-disabled'));
    });
}
