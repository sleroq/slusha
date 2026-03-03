import { limit } from 'grammy_ratelimiter';

function getLimiterKey(ctx: unknown): string | undefined {
    if (!ctx || typeof ctx !== 'object') {
        return undefined;
    }

    const maybe = ctx as {
        chat?: { id?: number };
        from?: { id?: number };
    };

    const chatId = maybe.chat?.id;
    if (typeof chatId === 'number') {
        return chatId.toString();
    }

    const userId = maybe.from?.id;
    if (typeof userId === 'number') {
        return userId.toString();
    }

    return undefined;
}

export function shortBurstLimiter() {
    return limit({
        timeFrame: 2000,
        limit: 1,
        onLimitExceeded: () => {
            return;
        },
        keyGenerator: (ctx) => {
            return getLimiterKey(ctx) ?? '';
        },
    });
}

export function rollingLimiter() {
    return limit({
        timeFrame: 1 * 60 * 1000,
        limit: 20,
        onLimitExceeded: async (ctx) => {
            const maybe = ctx as { reply?: (text: string) => unknown };
            if (typeof maybe.reply === 'function') {
                return await maybe.reply('Рейтлимитим тебя');
            }
            return;
        },
        keyGenerator: (ctx) => {
            return getLimiterKey(ctx) ?? '';
        },
    });
}
