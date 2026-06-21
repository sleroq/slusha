import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import type { Message, User } from 'grammy_types';
import type { DbClient } from '../db/client.ts';
import {
    chatMessages,
    messageReactions,
    messageReactionUsers,
} from '../db/schema.ts';
import type { ReplyMessage } from '../telegram/helpers.ts';
import { ReactionRepository } from './reactions.ts';
import type {
    ChatMessage,
    MessageReactions,
    ReactionCountEntry,
    ReactionDelta,
} from './types.ts';

type Tx = Parameters<Parameters<DbClient['transaction']>[0]>[0];

export function buildMessageFromRow(
    row: typeof chatMessages.$inferSelect,
    reactions?: MessageReactions,
): ChatMessage {
    return {
        id: row.messageId,
        text: row.text,
        isMyself: row.isMyself,
        info: JSON.parse(row.info) as Message,
        replyTo: row.replyToId
            ? {
                id: row.replyToId,
                text: row.replyToText ?? '',
                isMyself: row.replyToIsMyself ?? false,
                info: row.replyToInfo
                    ? JSON.parse(row.replyToInfo) as ReplyMessage
                    : ({} as ReplyMessage),
            }
            : undefined,
        threadId: row.threadId ?? undefined,
        threadRootMessageId: row.threadRootMessageId ?? undefined,
        threadParentMessageId: row.threadParentMessageId ?? undefined,
        threadSource: row.threadSource ?? undefined,
        reactions,
    };
}

export class MessageRepository {
    private reactions: ReactionRepository;

    constructor(private db: DbClient, private chatId: number) {
        this.reactions = new ReactionRepository(db, chatId);
    }

    async getHistory() {
        const rows = await this.db.select().from(chatMessages)
            .where(eq(chatMessages.chatId, this.chatId))
            .orderBy(asc(chatMessages.messageId));
        return this.withReactions(rows);
    }

    async getRecentHistory(limit: number) {
        if (limit <= 0) return [];
        const rows = await this.db.select().from(chatMessages)
            .where(eq(chatMessages.chatId, this.chatId))
            .orderBy(desc(chatMessages.messageId))
            .limit(limit);
        rows.reverse();
        return this.withReactions(rows);
    }

    async clear() {
        await this.db.transaction(async (tx: Tx) => {
            await tx.delete(messageReactionUsers).where(
                eq(messageReactionUsers.chatId, this.chatId),
            );
            await tx.delete(messageReactions).where(
                eq(messageReactions.chatId, this.chatId),
            );
            await tx.delete(chatMessages).where(
                eq(chatMessages.chatId, this.chatId),
            );
        });
    }

    async getLastMessage() {
        const rows = await this.getRecentHistory(1);
        return rows[0];
    }

    async addMessage(message: ChatMessage) {
        const values = {
            chatId: this.chatId,
            messageId: message.id,
            text: message.text,
            isMyself: message.isMyself,
            replyToId: message.replyTo?.id,
            replyToText: message.replyTo?.text,
            replyToIsMyself: message.replyTo?.isMyself,
            replyToInfo: message.replyTo?.info
                ? JSON.stringify(message.replyTo.info)
                : null,
            threadId: message.threadId,
            threadRootMessageId: message.threadRootMessageId,
            threadParentMessageId: message.threadParentMessageId,
            threadSource: message.threadSource,
            info: JSON.stringify(message.info),
        };
        await this.db.insert(chatMessages).values(values).onConflictDoUpdate({
            target: [chatMessages.chatId, chatMessages.messageId],
            set: values,
        });
    }

    async removeOldMessages(maxLength: number) {
        const countRows = await this.db.select({ total: sql<number>`count(*)` })
            .from(chatMessages)
            .where(eq(chatMessages.chatId, this.chatId));
        const overflow = (countRows[0]?.total ?? 0) - maxLength;
        if (overflow <= 0) return;

        const oldestRows = await this.db.select({
            messageId: chatMessages.messageId,
        })
            .from(chatMessages)
            .where(eq(chatMessages.chatId, this.chatId))
            .orderBy(asc(chatMessages.messageId))
            .limit(overflow);
        const toDelete = oldestRows.map((row) => row.messageId);
        if (toDelete.length === 0) return;

        await this.db.transaction(async (tx: Tx) => {
            for (let i = 0; i < toDelete.length; i += 500) {
                const messageIds = toDelete.slice(i, i + 500);
                await tx.delete(messageReactionUsers).where(and(
                    eq(messageReactionUsers.chatId, this.chatId),
                    inArray(messageReactionUsers.messageId, messageIds),
                ));
                await tx.delete(messageReactions).where(and(
                    eq(messageReactions.chatId, this.chatId),
                    inArray(messageReactions.messageId, messageIds),
                ));
                await tx.delete(chatMessages).where(and(
                    eq(chatMessages.chatId, this.chatId),
                    inArray(chatMessages.messageId, messageIds),
                ));
            }
        });
    }

    async updateMessageText(messageId: number, text: string) {
        await this.db.update(chatMessages).set({ text }).where(and(
            eq(chatMessages.chatId, this.chatId),
            eq(chatMessages.messageId, messageId),
        ));
    }

    async getMessageById(messageId: number) {
        const row = await this.db.query.chatMessages.findFirst({
            where: and(
                eq(chatMessages.chatId, this.chatId),
                eq(chatMessages.messageId, messageId),
            ),
        });
        if (!row) return undefined;
        const reactionsByMessage = await this.reactions.load([messageId]);
        return buildMessageFromRow(row, reactionsByMessage.get(messageId));
    }

    async getLastMessageByAuthorInTopic(
        authorId: number,
        topicId: number | undefined,
        lookbackLimit: number,
    ) {
        const history = await this.getRecentHistory(lookbackLimit);
        for (let i = history.length - 1; i >= 0; i--) {
            const message = history[i];
            if (
                message.info.from?.id === authorId &&
                message.info.message_thread_id === topicId
            ) return message;
        }
        return undefined;
    }

    async applyReactionDelta(
        messageId: number,
        delta: ReactionDelta,
        by?: Pick<User, 'id' | 'username' | 'first_name'>,
    ) {
        await this.reactions.applyDelta(
            messageId,
            delta,
            () => this.exists(messageId),
            by,
        );
    }

    async replaceReactionCounts(
        messageId: number,
        counts: ReactionCountEntry[],
    ) {
        await this.reactions.replaceCounts(
            messageId,
            counts,
            () => this.exists(messageId),
        );
    }

    private async exists(messageId: number) {
        const row = await this.db.select({ messageId: chatMessages.messageId })
            .from(chatMessages)
            .where(
                and(
                    eq(chatMessages.chatId, this.chatId),
                    eq(chatMessages.messageId, messageId),
                ),
            )
            .limit(1);
        return row.length > 0;
    }

    private async withReactions(rows: (typeof chatMessages.$inferSelect)[]) {
        if (rows.length === 0) return [];
        const reactionsByMessage = await this.reactions.load(
            rows.map((row) => row.messageId),
        );
        return rows.map((row) =>
            buildMessageFromRow(row, reactionsByMessage.get(row.messageId))
        );
    }
}
