import { limit } from 'grammy_ratelimiter';

export function shortBurstLimiter() {
    return limit({
        timeFrame: 2000,
        limit: 1,
        onLimitExceeded: () => {
            // no-op
        },
        keyGenerator: (ctx) => {
            if (ctx.hasChatType(['group', 'supergroup'])) {
                return ctx.chat.id.toString();
            }
            return ctx.from?.id.toString();
        },
    });
}

export function rollingLimiter() {
    return limit({
        timeFrame: 1 * 60 * 1000,
        limit: 20,
        onLimitExceeded: (ctx) => {
            return ctx.reply('Рейтлимитим тебя');
        },
        keyGenerator: (ctx) => {
            if (ctx.hasChatType(['group', 'supergroup'])) {
                return ctx.chat.id.toString();
            }
            return ctx.from?.id.toString();
        },
    });
}
