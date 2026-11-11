import { and, eq, sql } from 'drizzle-orm';
import type { UsageState } from '@earendil-works/pi-durable';
import type { AgentKey } from '../agent';
import type { Db } from '../db/client';
import { conversations, usage } from '../db/schema';

export type BudgetLimits = { user?: number; chat?: number };

function weekStart(now = new Date()) {
    const day = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    day.setUTCDate(day.getUTCDate() - (day.getUTCDay() + 6) % 7);
    return day.toISOString().slice(0, 10);
}

function totals(state: UsageState) {
    const result = { input: 0, output: 0, cacheRead: 0 };
    for (const counter of [...Object.values(state.models), ...Object.values(state.tools)]) {
        result.input += counter.input;
        result.output += counter.output;
        result.cacheRead += counter.cacheRead;
    }
    return result;
}

export function createBudgets(db: Db, limits: BudgetLimits) {
    async function remaining(accountType: 'user' | 'chat', accountId: number, limit: number | undefined) {
        if (limit === undefined) return null;
        const [row] = await db.select().from(usage).where(and(eq(usage.accountType, accountType), eq(usage.accountId, accountId), eq(usage.weekStart, weekStart()))).limit(1);
        if (!row) return 100;
        const spent = row.inputTokens + row.outputTokens + row.cacheReadTokens;
        return Math.max(0, 100 * (limit - spent) / limit);
    }

    async function status(chatId: number, userId: number) {
        const [user, chat] = await Promise.all([
            remaining('user', userId, limits.user),
            remaining('chat', chatId, limits.chat),
        ]);
        return { user, chat };
    }

    async function permits(chatId: number, userId: number) {
        const result = await status(chatId, userId);
        return result.user !== 0 && result.chat !== 0;
    }

    async function reconcile(key: AgentKey, state: UsageState) {
        const total = totals(state);
        const [conversation] = await db.select().from(conversations).where(and(eq(conversations.chatId, key.chatId), eq(conversations.topicId, key.topicId))).limit(1);
        if (!conversation) throw new Error('Missing conversation for usage accounting');
        await db.update(conversations).set({
            accountedInput: Math.min(conversation.accountedInput, total.input),
            accountedOutput: Math.min(conversation.accountedOutput, total.output),
            accountedCacheRead: Math.min(conversation.accountedCacheRead, total.cacheRead),
        }).where(and(eq(conversations.chatId, key.chatId), eq(conversations.topicId, key.topicId)));
    }

    async function start(key: AgentKey, eventId: number) {
        await db.update(conversations).set({ pendingRunEventId: eventId }).where(and(eq(conversations.chatId, key.chatId), eq(conversations.topicId, key.topicId)));
    }

    async function abandon(key: AgentKey) {
        await db.update(conversations).set({ pendingRunEventId: null }).where(and(eq(conversations.chatId, key.chatId), eq(conversations.topicId, key.topicId)));
    }

    async function record(key: AgentKey, userId: number, eventId: number, state: UsageState) {
        const total = totals(state);
        await db.transaction(async (tx) => {
            const [conversation] = await tx.select().from(conversations).where(and(eq(conversations.chatId, key.chatId), eq(conversations.topicId, key.topicId))).limit(1);
            if (!conversation) throw new Error('Missing conversation for usage accounting');
            const delta = {
                inputTokens: Math.max(0, total.input - conversation.accountedInput),
                outputTokens: Math.max(0, total.output - conversation.accountedOutput),
                cacheReadTokens: Math.max(0, total.cacheRead - conversation.accountedCacheRead),
            };
            for (const [accountType, accountId] of [['user', userId], ['chat', key.chatId]] as const) {
                await tx.insert(usage).values({ accountType, accountId, weekStart: weekStart(), ...delta }).onConflictDoUpdate({
                    target: [usage.accountType, usage.accountId, usage.weekStart],
                    set: {
                        inputTokens: sql`${usage.inputTokens} + ${delta.inputTokens}`,
                        outputTokens: sql`${usage.outputTokens} + ${delta.outputTokens}`,
                        cacheReadTokens: sql`${usage.cacheReadTokens} + ${delta.cacheReadTokens}`,
                    },
                });
            }
            await tx.update(conversations).set({
                contextEventId: Math.max(conversation.contextEventId, eventId),
                pendingRunEventId: null,
                accountedInput: total.input,
                accountedOutput: total.output,
                accountedCacheRead: total.cacheRead,
            }).where(and(eq(conversations.chatId, key.chatId), eq(conversations.topicId, key.topicId)));
        });
    }

    async function recordStandalone(chatId: number, userId: number, tokens: { input: number; output: number; cacheRead: number }) {
        const delta = { inputTokens: tokens.input, outputTokens: tokens.output, cacheReadTokens: tokens.cacheRead };
        await db.transaction(async (tx) => {
            for (const [accountType, accountId] of [['user', userId], ['chat', chatId]] as const) {
                await tx.insert(usage).values({ accountType, accountId, weekStart: weekStart(), ...delta }).onConflictDoUpdate({
                    target: [usage.accountType, usage.accountId, usage.weekStart],
                    set: {
                        inputTokens: sql`${usage.inputTokens} + ${delta.inputTokens}`,
                        outputTokens: sql`${usage.outputTokens} + ${delta.outputTokens}`,
                        cacheReadTokens: sql`${usage.cacheReadTokens} + ${delta.cacheReadTokens}`,
                    },
                });
            }
        });
    }

    return { permits, reconcile, start, abandon, record, recordStandalone, status };
}
export type Budgets = ReturnType<typeof createBudgets>;
