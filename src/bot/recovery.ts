import { eq, isNotNull, sql } from 'drizzle-orm';
import type { AgentSessions } from '../agent';
import type { Db } from '../db/client';
import { chats, conversations, events } from '../db/schema';
import type { Budgets } from './budget';

type PendingRun = {
    chatId: number;
    topicId: number;
    eventId: number;
    updateId: number;
    userId: number;
    canResume: boolean;
};

export async function pendingRuns(db: Db, groupReplyAgeMs: number): Promise<PendingRun[]> {
    const rows = await db
        .select({
            chatId: conversations.chatId,
            topicId: conversations.topicId,
            pendingReset: conversations.pendingReset,
            pendingRotation: conversations.pendingRotation,
            eventId: conversations.pendingRunEventId,
            updateId: events.updateId,
            userId: events.userId,
            occurredAt: events.occurredAt,
            chatType: chats.type,
            hiddenHistory: sql<boolean>`exists (
            select 1 from events as hidden
            where hidden.chat_id = ${conversations.chatId} and hidden.topic_id = ${conversations.topicId}
              and hidden.opted_out and not hidden.released
        )`,
        })
        .from(conversations)
        .leftJoin(events, eq(conversations.pendingRunEventId, events.id))
        .leftJoin(chats, eq(conversations.chatId, chats.id))
        .where(isNotNull(conversations.pendingRunEventId));

    return rows.map((row) => {
        if (
            row.eventId === null ||
            row.updateId === null ||
            row.userId === null ||
            row.occurredAt === null ||
            row.chatType === null
        ) {
            throw new Error('Interrupted run is missing its Telegram event');
        }
        const privateChat = row.chatType === 'private';
        return {
            chatId: row.chatId,
            topicId: row.topicId,
            eventId: row.eventId,
            updateId: row.updateId,
            userId: row.userId,
            canResume:
                !row.pendingReset &&
                !row.pendingRotation &&
                !row.hiddenHistory &&
                (privateChat || Date.now() - row.occurredAt.getTime() <= groupReplyAgeMs),
        };
    });
}

export async function recoverRuns(sessions: AgentSessions, budgets: Budgets, runs: PendingRun[]) {
    for (const run of runs) {
        const key = { chatId: run.chatId, topicId: run.topicId };
        const result = await sessions.recover(key, String(run.updateId));
        if (result) await budgets.record(key, run.userId, run.eventId, result.cumulativeUsage);
        else await budgets.abandon(key);
    }
}

export function resumeRequest(runs: PendingRun[], key: { chatId: number; topicId: number }) {
    const run = runs.find((item) => item.chatId === key.chatId && item.topicId === key.topicId);
    if (run?.canResume) return String(run.updateId);
    return undefined;
}
