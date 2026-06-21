import { Composer } from 'grammy';
import { SlushaContext } from '../setup-bot.ts';
import { getUsageSnapshot, renderProgressBar } from '../usage-window.ts';

function formatWindowLine(
    label: string,
    used: number,
    maxRequests: number,
    windowMinutes: number,
): string {
    const bar = renderProgressBar(used, maxRequests, 16);
    return `${label}: ${bar} ${used}/${maxRequests} (${windowMinutes}m)`;
}

export function registerUsage(composer: Composer<SlushaContext>) {
    composer.command('usage', async (ctx) => {
        const effectiveConfig = await ctx.chatConfig.getEffectiveConfig();
        const chatOverride = await ctx.chatConfig.getChatConfigOverride();
        const snapshot = await getUsageSnapshot(ctx.db, {
            config: effectiveConfig,
            chatId: ctx.chat.id,
            userId: ctx.from?.id,
            chatOverride,
        });

        const lines = [
            ctx.t('usage-title', { tier: snapshot.tier }),
            formatWindowLine(
                ctx.t('usage-user-window'),
                snapshot.user.used,
                snapshot.user.maxRequests,
                snapshot.user.windowMinutes,
            ),
            formatWindowLine(
                ctx.t('usage-chat-window'),
                snapshot.chat.used,
                snapshot.chat.maxRequests,
                snapshot.chat.windowMinutes,
            ),
        ];

        lines.push(
            ctx.t(snapshot.downgraded ? 'usage-limited' : 'usage-normal'),
        );

        return ctx.reply(lines.join('\n'));
    });
}
