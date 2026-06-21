import { SlushaContext } from '../setup-bot.ts';
import { Composer } from 'grammy';

export function registerSummary(
    composer: Composer<SlushaContext>,
) {
    composer.command('summary', async (ctx) => {
        await ctx.chats.patchChat(ctx.chat.id, { lastUse: Date.now() });
        return ctx.reply(ctx.t('summary-disabled'));
    });
}
