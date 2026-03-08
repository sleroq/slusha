import { Composer } from 'grammy';
import { SlushaContext } from '../setup-bot.ts';
import {
    getUsageSnapshot,
    renderProgressBar,
} from '../usage-window.ts';

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
        const effectiveConfig = await ctx.m.getEffectiveConfig();
        const chatOverride = await ctx.m.getChatConfigOverride();
        const snapshot = await getUsageSnapshot(ctx.memory.db, {
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

        if (snapshot.downgraded) {
            lines.push(
                ctx.t('usage-downgraded', {
                    model: effectiveConfig.requestWindow.downgradeModel,
                }),
            );
        } else {
            lines.push(ctx.t('usage-normal'));
        }

        return ctx.reply(lines.join('\n'));
    });
}
