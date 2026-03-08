import { limit } from 'grammy_ratelimiter';
import { rateLimitExceededTotal } from '../../app/metrics.ts';

type RedisClient = {
    incr(key: string): Promise<number>;
    pexpire(key: string, milliseconds: number): Promise<number>;
};

type RateLimitContext = {
    from: { id: number; is_bot: boolean; first_name: string } | undefined;
    chat?: { id: number; type: string };
    reply?: (text: string) => Promise<unknown>;
};

export function shortBurstLimiter() {
    return limit<RateLimitContext, RedisClient>({
        timeFrame: 2000,
        limit: 1,
        onLimitExceeded: () => {
            rateLimitExceededTotal.inc({
                limiter: 'short_burst',
                scope: 'chat_or_user',
            });
        },
        keyGenerator: (ctx) => {
            if (ctx.chat?.type === 'group' || ctx.chat?.type === 'supergroup') {
                return ctx.chat.id.toString();
            }
            return ctx.from?.id.toString() ?? 'anonymous';
        },
    });
}

export function rollingLimiter() {
    return limit<RateLimitContext, RedisClient>({
        timeFrame: 1 * 60 * 1000,
        limit: 20,
        onLimitExceeded: (ctx) => {
            rateLimitExceededTotal.inc({
                limiter: 'rolling',
                scope: 'chat_or_user',
            });
            if (ctx.chat?.id && ctx.reply) {
                return ctx.reply('Рейтлимитим тебя');
            }
        },
        keyGenerator: (ctx) => {
            if (ctx.chat?.type === 'group' || ctx.chat?.type === 'supergroup') {
                return ctx.chat.id.toString();
            }
            return ctx.from?.id.toString() ?? 'anonymous';
        },
    });
}
