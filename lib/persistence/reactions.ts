import { and, eq, inArray } from 'drizzle-orm';
import type { User } from 'grammy_types';
import type { DbClient } from '../db/client.ts';
import { messageReactions, messageReactionUsers } from '../db/schema.ts';
import type {
    MessageReactions,
    ReactionBy,
    ReactionCountEntry,
    ReactionDelta,
} from './types.ts';

export function reactionKey(
    reaction:
        | { type: 'emoji'; emoji: string }
        | { type: 'custom'; customEmojiId: string },
): string {
    return reaction.type === 'emoji'
        ? `e:${reaction.emoji}`
        : `c:${reaction.customEmojiId}`;
}

export class ReactionRepository {
    constructor(private db: DbClient, private chatId: number) {}

    async load(messageIds: number[]): Promise<Map<number, MessageReactions>> {
        if (messageIds.length === 0) return new Map();

        const reactionRows = await this.db
            .select()
            .from(messageReactions)
            .where(
                and(
                    eq(messageReactions.chatId, this.chatId),
                    inArray(messageReactions.messageId, messageIds),
                ),
            );

        const keys = reactionRows.map((r) => r.reactionKey);
        const usersRows = keys.length === 0 ? [] : await this.db
            .select()
            .from(messageReactionUsers)
            .where(and(
                eq(messageReactionUsers.chatId, this.chatId),
                inArray(messageReactionUsers.reactionKey, keys),
                inArray(messageReactionUsers.messageId, messageIds),
            ));

        const usersByReaction = new Map<string, ReactionBy[]>();
        for (const row of usersRows) {
            const key = `${row.messageId}:${row.reactionKey}`;
            const users = usersByReaction.get(key) ?? [];
            users.push({
                id: row.userId,
                username: row.username ?? undefined,
                name: row.name,
            });
            usersByReaction.set(key, users);
        }

        const byMessage = new Map<number, MessageReactions>();
        for (const row of reactionRows) {
            const bucket = byMessage.get(row.messageId) ?? {};
            bucket[row.reactionKey] = {
                type: row.type,
                emoji: row.emoji ?? undefined,
                customEmojiId: row.customEmojiId ?? undefined,
                by: usersByReaction.get(
                    `${row.messageId}:${row.reactionKey}`,
                ) ?? [],
                count: row.count,
            };
            byMessage.set(row.messageId, bucket);
        }
        return byMessage;
    }

    async applyDelta(
        messageId: number,
        delta: ReactionDelta,
        by?: Pick<User, 'id' | 'username' | 'first_name'>,
    ) {
        for (const emoji of delta.emojiAdded) {
            await this.upsert(
                messageId,
                { type: 'emoji', emoji },
                by,
            );
        }
        for (const emoji of delta.emojiRemoved) {
            await this.remove(messageId, { type: 'emoji', emoji }, by);
        }
        for (const customEmojiId of delta.customAdded) {
            await this.upsert(
                messageId,
                { type: 'custom', customEmojiId },
                by,
            );
        }
        for (const customEmojiId of delta.customRemoved) {
            await this.remove(messageId, { type: 'custom', customEmojiId }, by);
        }
    }

    async replaceCounts(
        messageId: number,
        counts: ReactionCountEntry[],
    ) {
        const nextKeys = new Set(counts.map((c) =>
            reactionKey(
                c.type === 'emoji'
                    ? { type: 'emoji', emoji: c.emoji }
                    : { type: 'custom', customEmojiId: c.customEmojiId },
            )
        ));
        const existingRows = await this.db
            .select({ reactionKey: messageReactions.reactionKey })
            .from(messageReactions)
            .where(and(
                eq(messageReactions.chatId, this.chatId),
                eq(messageReactions.messageId, messageId),
            ));
        const staleKeys = existingRows.map((row) => row.reactionKey).filter((
            key,
        ) => !nextKeys.has(key));

        for (const c of counts) {
            const key = reactionKey(
                c.type === 'emoji'
                    ? { type: 'emoji', emoji: c.emoji }
                    : { type: 'custom', customEmojiId: c.customEmojiId },
            );
            await this.db.insert(messageReactions).values({
                chatId: this.chatId,
                messageId,
                reactionKey: key,
                type: c.type,
                emoji: c.type === 'emoji' ? c.emoji : null,
                customEmojiId: c.type === 'custom' ? c.customEmojiId : null,
                count: c.total,
            }).onConflictDoUpdate({
                target: [
                    messageReactions.chatId,
                    messageReactions.messageId,
                    messageReactions.reactionKey,
                ],
                set: { count: c.total },
            });
        }

        if (staleKeys.length === 0) return;
        await this.db.delete(messageReactionUsers).where(and(
            eq(messageReactionUsers.chatId, this.chatId),
            eq(messageReactionUsers.messageId, messageId),
            inArray(messageReactionUsers.reactionKey, staleKeys),
        ));
        await this.db.delete(messageReactions).where(and(
            eq(messageReactions.chatId, this.chatId),
            eq(messageReactions.messageId, messageId),
            inArray(messageReactions.reactionKey, staleKeys),
        ));
    }

    private async upsert(
        messageId: number,
        reaction: { type: 'emoji'; emoji: string } | {
            type: 'custom';
            customEmojiId: string;
        },
        by?: Pick<User, 'id' | 'username' | 'first_name'>,
    ) {
        const key = reactionKey(reaction);
        const existing = await this.db.query.messageReactions.findFirst({
            where: and(
                eq(messageReactions.chatId, this.chatId),
                eq(messageReactions.messageId, messageId),
                eq(messageReactions.reactionKey, key),
            ),
        });
        const count = Math.max(1, (existing?.count ?? 0) + 1);
        await this.db.insert(messageReactions).values({
            chatId: this.chatId,
            messageId,
            reactionKey: key,
            type: reaction.type,
            emoji: reaction.type === 'emoji' ? reaction.emoji : null,
            customEmojiId: reaction.type === 'custom'
                ? reaction.customEmojiId
                : null,
            count,
        }).onConflictDoUpdate({
            target: [
                messageReactions.chatId,
                messageReactions.messageId,
                messageReactions.reactionKey,
            ],
            set: {
                type: reaction.type,
                emoji: reaction.type === 'emoji' ? reaction.emoji : null,
                customEmojiId: reaction.type === 'custom'
                    ? reaction.customEmojiId
                    : null,
                count,
            },
        });

        if (!by) return;
        await this.db.insert(messageReactionUsers).values({
            chatId: this.chatId,
            messageId,
            reactionKey: key,
            userId: by.id,
            username: by.username,
            name: by.first_name,
        }).onConflictDoUpdate({
            target: [
                messageReactionUsers.chatId,
                messageReactionUsers.messageId,
                messageReactionUsers.reactionKey,
                messageReactionUsers.userId,
            ],
            set: { username: by.username, name: by.first_name },
        });
    }

    private async remove(
        messageId: number,
        reaction: { type: 'emoji'; emoji: string } | {
            type: 'custom';
            customEmojiId: string;
        },
        by?: Pick<User, 'id' | 'username' | 'first_name'>,
    ) {
        const key = reactionKey(reaction);
        const existing = await this.db.query.messageReactions.findFirst({
            where: and(
                eq(messageReactions.chatId, this.chatId),
                eq(messageReactions.messageId, messageId),
                eq(messageReactions.reactionKey, key),
            ),
        });
        if (!existing) return;

        if (by) {
            await this.db.delete(messageReactionUsers).where(and(
                eq(messageReactionUsers.chatId, this.chatId),
                eq(messageReactionUsers.messageId, messageId),
                eq(messageReactionUsers.reactionKey, key),
                eq(messageReactionUsers.userId, by.id),
            ));
        }

        const count = Math.max(0, existing.count - 1);
        const users = await this.db.select({
            userId: messageReactionUsers.userId,
        })
            .from(messageReactionUsers)
            .where(and(
                eq(messageReactionUsers.chatId, this.chatId),
                eq(messageReactionUsers.messageId, messageId),
                eq(messageReactionUsers.reactionKey, key),
            ))
            .limit(1);
        if (count <= 0 && users.length === 0) {
            await this.db.delete(messageReactions).where(and(
                eq(messageReactions.chatId, this.chatId),
                eq(messageReactions.messageId, messageId),
                eq(messageReactions.reactionKey, key),
            ));
            return;
        }
        await this.db.update(messageReactions).set({ count }).where(and(
            eq(messageReactions.chatId, this.chatId),
            eq(messageReactions.messageId, messageId),
            eq(messageReactions.reactionKey, key),
        ));
    }
}
