import { and, eq, gte, lt, sql } from 'drizzle-orm';
import { ChatConfigOverride, UserConfig } from '../config.ts';
import { DbClient } from '../db/client.ts';
import { requestWindowEvents } from '../db/schema.ts';
import {
    usageCleanupRunsTotal,
    usageDowngradedTotal,
    usageEventsRecordedTotal,
} from '../app/metrics.ts';

export type UsageTier = 'free' | 'trusted';

type UsageLimit = {
    maxRequests: number;
    windowMinutes: number;
};

export type UsageCounterSnapshot = UsageLimit & {
    used: number;
    remaining: number;
    ratio: number;
};

export type UsageSnapshot = {
    tier: UsageTier;
    downgraded: boolean;
    downgradeReason: 'none' | 'user' | 'chat' | 'both';
    user: UsageCounterSnapshot;
    chat: UsageCounterSnapshot;
};

function clampRatio(used: number, maxRequests: number): number {
    if (maxRequests <= 0) return 0;
    return Math.max(0, Math.min(1, used / maxRequests));
}

function withCount(limit: UsageLimit, used: number): UsageCounterSnapshot {
    return {
        ...limit,
        used,
        remaining: Math.max(0, limit.maxRequests - used),
        ratio: clampRatio(used, limit.maxRequests),
    };
}

function mergeLimit(
    base: UsageLimit,
    override?: Partial<UsageLimit>,
): UsageLimit {
    return {
        maxRequests: override?.maxRequests ?? base.maxRequests,
        windowMinutes: override?.windowMinutes ?? base.windowMinutes,
    };
}

export function resolveUsageTier(
    config: UserConfig,
    userId?: number,
): UsageTier {
    if (userId && config.trustedIds.includes(userId)) {
        return 'trusted';
    }
    return 'free';
}

export function resolvePerChatLimit(
    config: UserConfig,
    tier: UsageTier,
    override?: ChatConfigOverride,
): UsageLimit {
    const base = config.requestWindow[tier].perChat;
    const chatOverride = override?.requestWindowPerChat?.[tier];
    return mergeLimit(base, chatOverride);
}

function resolvePerUserLimit(config: UserConfig, tier: UsageTier): UsageLimit {
    return config.requestWindow[tier].perUser;
}

export async function cleanupUsageEvents(
    db: DbClient,
    config: UserConfig,
    now = Date.now(),
) {
    const limits = [
        config.requestWindow.free.perUser.windowMinutes,
        config.requestWindow.free.perChat.windowMinutes,
        config.requestWindow.trusted.perUser.windowMinutes,
        config.requestWindow.trusted.perChat.windowMinutes,
    ];
    const maxWindowMinutes = Math.max(...limits);
    const cutoff = now - maxWindowMinutes * 60 * 1000;
    await db.delete(requestWindowEvents).where(
        lt(requestWindowEvents.createdAt, cutoff),
    );
    usageCleanupRunsTotal.inc();
}

export async function recordUsageEvent(
    db: DbClient,
    input: { chatId: number; userId?: number; now?: number },
) {
    await db.insert(requestWindowEvents).values({
        chatId: input.chatId,
        userId: input.userId,
        createdAt: input.now ?? Date.now(),
    });
    usageEventsRecordedTotal.inc({
        has_user_id: input.userId ? 'true' : 'false',
    });
}

export async function getUsageSnapshot(
    db: DbClient,
    input: {
        config: UserConfig;
        chatId: number;
        userId?: number;
        chatOverride?: ChatConfigOverride;
        now?: number;
    },
): Promise<UsageSnapshot> {
    const now = input.now ?? Date.now();
    const tier = resolveUsageTier(input.config, input.userId);
    const userLimit = resolvePerUserLimit(input.config, tier);
    const chatLimit = resolvePerChatLimit(
        input.config,
        tier,
        input.chatOverride,
    );

    const userWindowStart = now - userLimit.windowMinutes * 60 * 1000;
    const chatWindowStart = now - chatLimit.windowMinutes * 60 * 1000;

    const [userRows, chatRows] = await Promise.all([
        input.userId
            ? db.select({ total: sql<number>`count(*)` })
                .from(requestWindowEvents)
                .where(and(
                    eq(requestWindowEvents.userId, input.userId),
                    gte(requestWindowEvents.createdAt, userWindowStart),
                ))
            : Promise.resolve([{ total: 0 }]),
        db.select({ total: sql<number>`count(*)` })
            .from(requestWindowEvents)
            .where(and(
                eq(requestWindowEvents.chatId, input.chatId),
                gte(requestWindowEvents.createdAt, chatWindowStart),
            )),
    ]);

    const userUsed = userRows[0]?.total ?? 0;
    const chatUsed = chatRows[0]?.total ?? 0;

    const user = withCount(userLimit, userUsed);
    const chat = withCount(chatLimit, chatUsed);

    const userExceeded = user.used >= user.maxRequests;
    const chatExceeded = chat.used >= chat.maxRequests;
    const downgradeReason: UsageSnapshot['downgradeReason'] = userExceeded &&
            chatExceeded
        ? 'both'
        : userExceeded
        ? 'user'
        : chatExceeded
        ? 'chat'
        : 'none';

    if (downgradeReason !== 'none') {
        usageDowngradedTotal.inc({
            tier,
            reason: downgradeReason,
        });
    }

    return {
        tier,
        downgraded: downgradeReason !== 'none',
        downgradeReason,
        user,
        chat,
    };
}

export function renderProgressBar(
    used: number,
    maxRequests: number,
    width = 16,
): string {
    if (width < 1) return '';
    const ratio = clampRatio(used, maxRequests);
    const filled = Math.round(ratio * width);
    return `${'█'.repeat(filled)}${'░'.repeat(width - filled)}`;
}
