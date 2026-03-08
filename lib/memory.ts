import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { Chat as TgChat, Message, User } from 'grammy_types';
import { Character } from './charhub/api.ts';
import {
    DbClient,
    ensureDatabaseWritable,
    ensureSqlitePragmas,
    getDb,
} from './db/client.ts';
import {
    chatCharacters,
    chatConfigOverrides,
    chatMembers,
    chatMessages,
    chatNotes,
    chatOptOutUsers,
    chats,
    messageReactions,
    messageReactionUsers,
} from './db/schema.ts';
import logger from './logger.ts';
import { ReplyMessage } from './telegram/helpers.ts';
import {
    ChatConfigOverride,
    chatConfigOverrideSchema,
    getGlobalUserConfig,
    mergeWithChatOverride,
    parseChatOverridePayload,
    serializeChatOverride,
    UserConfig,
} from './config.ts';

export interface ReplyTo {
    id: number;
    text: string;
    info: ReplyMessage;
    isMyself: boolean;
}

export interface ReactionBy {
    id: number;
    username?: string;
    name: string;
}

export interface ReactionRecord {
    type: 'emoji' | 'custom';
    emoji?: string;
    customEmojiId?: string;
    by: ReactionBy[];
    count: number;
}

export interface ReactionDelta {
    emojiAdded: string[];
    emojiRemoved: string[];
    customAdded: string[];
    customRemoved: string[];
}

export type ReactionCountEntry =
    | { type: 'emoji'; emoji: string; total: number }
    | { type: 'custom'; customEmojiId: string; total: number };

export type MessageReactions = { [key: string]: ReactionRecord };

function reactionKey(
    reaction:
        | { type: 'emoji'; emoji: string }
        | { type: 'custom'; customEmojiId: string },
): string {
    return reaction.type === 'emoji'
        ? `e:${reaction.emoji}`
        : `c:${reaction.customEmojiId}`;
}

export interface ChatMessage {
    id: number;
    text: string;
    replyTo?: ReplyTo;
    threadId?: string;
    threadRootMessageId?: number;
    threadParentMessageId?: number;
    threadSource?: string;
    isMyself: boolean;
    info: Message;
    reactions?: MessageReactions;
}

export interface OptOutUser {
    id: number;
    username?: string;
    first_name: string;
}

export interface Member {
    id: number;
    username?: string;
    first_name: string;
    description: string;
    info: User;
    lastUse: number;
}

export interface BotCharacter extends Character {
    names: string[];
}

export interface Chat {
    notes: string[];
    lastNotes: number;
    lastMemory: number;
    history: ChatMessage[];
    memory?: string;
    lastUse: number;
    info: TgChat;
    chatModel?: string;
    character?: BotCharacter;
    optOutUsers: OptOutUser[];
    members: Member[];
    messagesToPass?: number;
    randomReplyProbability?: number;
    hateMode?: boolean;
    locale?: string;
    disableRepliesDueToRights?: boolean;
    disabledReplyRightsLastProbeAt?: number;
}

type Tx = Parameters<Parameters<DbClient['transaction']>[0]>[0];

function parseJson<T>(value: string): T {
    return JSON.parse(value) as T;
}

function buildMessageFromRow(
    row: typeof chatMessages.$inferSelect,
    reactions?: MessageReactions,
): ChatMessage {
    return {
        id: row.messageId,
        text: row.text,
        isMyself: row.isMyself,
        info: parseJson<Message>(row.info),
        replyTo: row.replyToId
            ? {
                id: row.replyToId,
                text: row.replyToText ?? '',
                isMyself: row.replyToIsMyself ?? false,
                info: row.replyToInfo
                    ? parseJson<ReplyMessage>(row.replyToInfo)
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

async function loadMessageReactions(
    db: DbClient,
    chatId: number,
    messageIds?: number[],
): Promise<Map<number, MessageReactions>> {
    if (messageIds && messageIds.length === 0) {
        return new Map();
    }

    const reactionWhere = messageIds
        ? and(
            eq(messageReactions.chatId, chatId),
            inArray(messageReactions.messageId, messageIds),
        )
        : eq(messageReactions.chatId, chatId);

    const reactionRows = await db
        .select()
        .from(messageReactions)
        .where(reactionWhere);

    const keys = reactionRows.map((
        r: typeof messageReactions.$inferSelect,
    ) => r.reactionKey);
    const usersRows = keys.length === 0 ? [] : await db
        .select()
        .from(messageReactionUsers)
        .where(and(
            eq(messageReactionUsers.chatId, chatId),
            inArray(messageReactionUsers.reactionKey, keys),
            messageIds
                ? inArray(messageReactionUsers.messageId, messageIds)
                : undefined,
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

    const reactionsByMessage = new Map<number, MessageReactions>();
    for (const row of reactionRows) {
        const bucket = reactionsByMessage.get(row.messageId) ?? {};
        bucket[row.reactionKey] = {
            type: row.type,
            emoji: row.emoji ?? undefined,
            customEmojiId: row.customEmojiId ?? undefined,
            by: usersByReaction.get(`${row.messageId}:${row.reactionKey}`) ??
                [],
            count: row.count,
        };
        reactionsByMessage.set(row.messageId, bucket);
    }

    return reactionsByMessage;
}

export class Memory {
    db: DbClient;

    constructor(db?: DbClient) {
        this.db = db ?? getDb();
    }

    private async ensureChat(tgChat: TgChat) {
        await this.db
            .insert(chats)
            .values({
                id: tgChat.id,
                info: JSON.stringify(tgChat),
                lastUse: Date.now(),
                lastMemory: 0,
                lastNotes: 0,
            })
            .onConflictDoNothing();
    }

    async getChatById(chatId: number): Promise<Chat | undefined> {
        const chatRow = await this.db.query.chats.findFirst({
            where: eq(chats.id, chatId),
        });

        if (!chatRow) {
            return undefined;
        }

        const [
            notesRows,
            membersRows,
            optOutRows,
            characterRow,
            configOverrideRow,
        ] = await Promise.all([
            this.db
                .select()
                .from(chatNotes)
                .where(eq(chatNotes.chatId, chatId))
                .orderBy(asc(chatNotes.noteIndex)),
            this.db
                .select()
                .from(chatMembers)
                .where(eq(chatMembers.chatId, chatId))
                .orderBy(asc(chatMembers.lastUse)),
            this.db
                .select()
                .from(chatOptOutUsers)
                .where(eq(chatOptOutUsers.chatId, chatId)),
            this.db.query.chatCharacters.findFirst({
                where: eq(chatCharacters.chatId, chatId),
            }),
            this.db.query.chatConfigOverrides.findFirst({
                where: eq(chatConfigOverrides.chatId, chatId),
            }),
        ]);

        const configOverride = configOverrideRow
            ? parseChatOverridePayload(configOverrideRow.payload)
            : undefined;

        return {
            notes: notesRows.map((n: typeof chatNotes.$inferSelect) => n.text),
            lastNotes: chatRow.lastNotes,
            lastMemory: chatRow.lastMemory,
            history: [],
            memory: chatRow.memory ?? undefined,
            lastUse: chatRow.lastUse,
            info: parseJson<TgChat>(chatRow.info),
            chatModel: configOverride?.ai?.model,
            character: characterRow
                ? {
                    ...parseJson<Character>(characterRow.payload),
                    names: parseJson<string[]>(characterRow.names),
                }
                : undefined,
            optOutUsers: optOutRows.map((
                u: typeof chatOptOutUsers.$inferSelect,
            ) => ({
                id: u.userId,
                username: u.username ?? undefined,
                first_name: u.firstName,
            })),
            members: membersRows.map((m: typeof chatMembers.$inferSelect) => ({
                id: m.userId,
                username: m.username ?? undefined,
                first_name: m.firstName,
                description: m.description,
                info: parseJson<User>(m.info),
                lastUse: m.lastUse,
            })),
            messagesToPass: configOverride?.ai?.messagesToPass,
            randomReplyProbability: configOverride?.randomReplyProbability,
            hateMode: chatRow.hateMode ?? undefined,
            locale: chatRow.locale ?? undefined,
            disableRepliesDueToRights: configOverride
                ?.disableRepliesDueToRights,
            disabledReplyRightsLastProbeAt: configOverride
                ?.disabledReplyRightsLastProbeAt,
        };
    }

    async getChat(tgChat: TgChat): Promise<Chat> {
        await this.ensureChat(tgChat);
        const chat = await this.getChatById(tgChat.id);
        if (!chat) {
            throw new Error(`Could not load chat ${tgChat.id}`);
        }
        return chat;
    }

    async migrateChat(from: number, to: number, toInfo: TgChat) {
        if (from === to) return;

        await this.db.transaction(async (tx: Tx) => {
            const fromChat = await tx.query.chats.findFirst({
                where: eq(chats.id, from),
            });
            if (!fromChat) {
                await tx
                    .insert(chats)
                    .values({
                        id: to,
                        info: JSON.stringify(toInfo),
                        lastUse: Date.now(),
                        lastMemory: 0,
                        lastNotes: 0,
                    })
                    .onConflictDoNothing();
                return;
            }

            await tx.delete(messageReactionUsers).where(
                eq(messageReactionUsers.chatId, to),
            );
            await tx.delete(chats).where(eq(chats.id, to));

            await tx.insert(chats).values({
                id: to,
                info: JSON.stringify(toInfo),
                lastUse: fromChat.lastUse,
                lastNotes: fromChat.lastNotes,
                lastMemory: fromChat.lastMemory,
                memory: fromChat.memory,
                hateMode: fromChat.hateMode,
                locale: fromChat.locale,
            });

            await tx.update(chatNotes).set({ chatId: to }).where(
                eq(chatNotes.chatId, from),
            );
            await tx.update(chatMembers).set({ chatId: to }).where(
                eq(chatMembers.chatId, from),
            );
            await tx.update(chatOptOutUsers).set({ chatId: to }).where(
                eq(chatOptOutUsers.chatId, from),
            );
            await tx.update(chatMessages).set({ chatId: to }).where(
                eq(chatMessages.chatId, from),
            );
            await tx.update(messageReactions).set({ chatId: to }).where(
                eq(messageReactions.chatId, from),
            );
            await tx.update(messageReactionUsers).set({ chatId: to }).where(
                eq(messageReactionUsers.chatId, from),
            );
            await tx.update(chatCharacters).set({ chatId: to }).where(
                eq(chatCharacters.chatId, from),
            );
            await tx.update(chatConfigOverrides).set({ chatId: to }).where(
                eq(chatConfigOverrides.chatId, from),
            );

            await tx.delete(chats).where(eq(chats.id, from));
        });
    }
}

// Class avalivle when handling message
// with functionality specific to current chat
// like get previous messages from this user, get last notes, etc
export class ChatMemory {
    memory: Memory;
    chatInfo: TgChat;

    constructor(memory: Memory, chat: TgChat) {
        this.memory = memory;
        this.chatInfo = chat;
    }

    getChat() {
        return this.memory.getChat(this.chatInfo);
    }

    private async patchChat(
        patch: Partial<{
            lastUse: number;
            lastNotes: number;
            lastMemory: number;
            memory: string | null;
            hateMode: boolean | null;
            locale: string | null;
        }>,
    ) {
        await this.memory.db.update(chats).set(patch).where(
            eq(chats.id, this.chatInfo.id),
        );
    }

    async getChatConfigOverride(): Promise<ChatConfigOverride | undefined> {
        const row = await this.memory.db.query.chatConfigOverrides.findFirst({
            where: eq(chatConfigOverrides.chatId, this.chatInfo.id),
        });

        if (!row) return undefined;
        return parseChatOverridePayload(row.payload);
    }

    private isOverrideEmpty(value: ChatConfigOverride) {
        const noAi = !value.ai ||
            Object.values(value.ai).every((item) => item === undefined);
        const rest = Object.entries(value)
            .filter(([key]) => key !== 'ai')
            .map(([, item]) => item)
            .every((item) => {
                if (item === undefined) return true;
                if (item && typeof item === 'object' && !Array.isArray(item)) {
                    return Object.values(item as Record<string, unknown>).every(
                        (nested) => {
                            if (nested === undefined) return true;
                            if (
                                nested && typeof nested === 'object' &&
                                !Array.isArray(nested)
                            ) {
                                return Object.values(
                                    nested as Record<string, unknown>,
                                ).every((deep) => deep === undefined);
                            }
                            return false;
                        },
                    );
                }
                return false;
            });
        return noAi && rest;
    }

    private async setChatConfigOverrideRaw(
        value: ChatConfigOverride | undefined,
        updatedBy?: number,
    ) {
        if (!value || this.isOverrideEmpty(value)) {
            await this.memory.db.delete(chatConfigOverrides).where(
                eq(chatConfigOverrides.chatId, this.chatInfo.id),
            );
            return;
        }

        await this.memory.db
            .insert(chatConfigOverrides)
            .values({
                chatId: this.chatInfo.id,
                payload: serializeChatOverride(value),
                updatedBy,
                updatedAt: Date.now(),
            })
            .onConflictDoUpdate({
                target: [chatConfigOverrides.chatId],
                set: {
                    payload: serializeChatOverride(value),
                    updatedBy,
                    updatedAt: Date.now(),
                },
            });
    }

    async setChatConfigOverride(
        value: ChatConfigOverride | undefined,
        updatedBy?: number,
    ) {
        if (value === undefined) {
            await this.setChatConfigOverrideRaw(undefined, updatedBy);
            return;
        }

        const parsed = chatConfigOverrideSchema.safeParse(value);
        if (!parsed.success) {
            throw new Error(
                'Invalid chat config override payload: ' + parsed.error.message,
            );
        }

        await this.setChatConfigOverrideRaw(parsed.data, updatedBy);
    }

    async getEffectiveConfig(_base?: UserConfig) {
        const base = await getGlobalUserConfig(this.memory.db);
        const override = await this.getChatConfigOverride();
        return mergeWithChatOverride(base, override);
    }

    async getHistory() {
        const rows = await this.memory.db
            .select()
            .from(chatMessages)
            .where(eq(chatMessages.chatId, this.chatInfo.id))
            .orderBy(asc(chatMessages.messageId));

        if (rows.length === 0) {
            return [];
        }

        const messageIds = rows.map((row) => row.messageId);
        const reactionsByMessage = await loadMessageReactions(
            this.memory.db,
            this.chatInfo.id,
            messageIds,
        );

        return rows.map((row) =>
            buildMessageFromRow(row, reactionsByMessage.get(row.messageId))
        );
    }

    async getRecentHistory(limit: number) {
        if (limit <= 0) {
            return [];
        }

        const rows = await this.memory.db
            .select()
            .from(chatMessages)
            .where(eq(chatMessages.chatId, this.chatInfo.id))
            .orderBy(desc(chatMessages.messageId))
            .limit(limit);

        if (rows.length === 0) {
            return [];
        }

        rows.reverse();
        const messageIds = rows.map((row) => row.messageId);
        const reactionsByMessage = await loadMessageReactions(
            this.memory.db,
            this.chatInfo.id,
            messageIds,
        );

        return rows.map((row) =>
            buildMessageFromRow(row, reactionsByMessage.get(row.messageId))
        );
    }

    async clear() {
        await this.memory.db.transaction(async (tx: Tx) => {
            await tx.delete(messageReactionUsers).where(
                eq(messageReactionUsers.chatId, this.chatInfo.id),
            );
            await tx.delete(messageReactions).where(
                eq(messageReactions.chatId, this.chatInfo.id),
            );
            await tx.delete(chatMessages).where(
                eq(chatMessages.chatId, this.chatInfo.id),
            );
            await tx.update(chats).set({ lastNotes: 0 }).where(
                eq(chats.id, this.chatInfo.id),
            );
        });
    }

    async getLastMessage() {
        const history = await this.getHistory();
        return history.slice(-1)[0];
    }

    async addMessage(message: ChatMessage) {
        await this.memory.db
            .insert(chatMessages)
            .values({
                chatId: this.chatInfo.id,
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
            })
            .onConflictDoUpdate({
                target: [chatMessages.chatId, chatMessages.messageId],
                set: {
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
                },
            });
    }

    async removeOldMessages(maxLength: number) {
        const countRows = await this.memory.db
            .select({ total: sql<number>`count(*)` })
            .from(chatMessages)
            .where(eq(chatMessages.chatId, this.chatInfo.id));
        const total = countRows[0]?.total ?? 0;
        const overflow = total - maxLength;

        if (overflow <= 0) return;

        const oldestRows = await this.memory.db
            .select({ messageId: chatMessages.messageId })
            .from(chatMessages)
            .where(eq(chatMessages.chatId, this.chatInfo.id))
            .orderBy(asc(chatMessages.messageId))
            .limit(overflow);
        const toDelete = oldestRows.map((row) => row.messageId);

        if (toDelete.length === 0) return;

        const chunks: number[][] = [];
        for (let i = 0; i < toDelete.length; i += 500) {
            chunks.push(toDelete.slice(i, i + 500));
        }

        await this.memory.db.transaction(async (tx: Tx) => {
            for (const messageIds of chunks) {
                await tx.delete(messageReactionUsers).where(and(
                    eq(messageReactionUsers.chatId, this.chatInfo.id),
                    inArray(messageReactionUsers.messageId, messageIds),
                ));
                await tx.delete(messageReactions).where(and(
                    eq(messageReactions.chatId, this.chatInfo.id),
                    inArray(messageReactions.messageId, messageIds),
                ));
                await tx.delete(chatMessages).where(and(
                    eq(chatMessages.chatId, this.chatInfo.id),
                    inArray(chatMessages.messageId, messageIds),
                ));
            }
        });
    }

    async removeOldNotes(maxLength: number) {
        const chat = await this.getChat();
        if (chat.notes.length <= maxLength) return;

        const nextNotes = chat.notes.slice(chat.notes.length - maxLength);
        await this.replaceNotes(nextNotes);
    }

    private async replaceNotes(notes: string[]) {
        await this.memory.db.transaction(async (tx: Tx) => {
            await tx.delete(chatNotes).where(
                eq(chatNotes.chatId, this.chatInfo.id),
            );
            if (notes.length > 0) {
                await tx.insert(chatNotes).values(notes.map((note, index) => ({
                    chatId: this.chatInfo.id,
                    noteIndex: index,
                    text: note,
                })));
            }
        });
    }

    async addNote(note: string) {
        const chat = await this.getChat();
        const notes = [...chat.notes, note];
        await this.replaceNotes(notes);
    }

    async setNotes(notes: string[]) {
        const normalized = notes
            .map((note) => note.trim())
            .filter((note) => note.length > 0);
        await this.replaceNotes(normalized);
    }

    async setLastUse(value = Date.now()) {
        await this.patchChat({ lastUse: value });
    }

    async setLastNotesMessageId(value: number) {
        await this.patchChat({ lastNotes: value });
    }

    async setLastMemoryMessageId(value: number) {
        await this.patchChat({ lastMemory: value });
    }

    async setMemory(value?: string) {
        await this.patchChat({ memory: value ?? null });
    }

    async clearNotes() {
        await this.memory.db.delete(chatNotes).where(
            eq(chatNotes.chatId, this.chatInfo.id),
        );
    }

    async setChatModel(value?: string) {
        const current = (await this.getChatConfigOverride()) ?? {};
        const nextAi = { ...(current.ai ?? {}) };

        if (value === undefined) {
            delete nextAi.model;
        } else {
            nextAi.model = value;
        }

        const next: ChatConfigOverride = { ...current };
        if (Object.keys(nextAi).length === 0) {
            delete next.ai;
        } else {
            next.ai = nextAi;
        }

        await this.setChatConfigOverrideRaw(next);
    }

    async setMessagesToPass(value?: number) {
        const current = (await this.getChatConfigOverride()) ?? {};
        const nextAi = { ...(current.ai ?? {}) };

        if (value === undefined) {
            delete nextAi.messagesToPass;
        } else {
            nextAi.messagesToPass = value;
        }

        const next: ChatConfigOverride = { ...current };
        if (Object.keys(nextAi).length === 0) {
            delete next.ai;
        } else {
            next.ai = nextAi;
        }

        await this.setChatConfigOverrideRaw(next);
    }

    async setRandomReplyProbability(value?: number) {
        const current = (await this.getChatConfigOverride()) ?? {};
        const next: ChatConfigOverride = { ...current };

        if (value === undefined) {
            delete next.randomReplyProbability;
        } else {
            next.randomReplyProbability = value;
        }

        await this.setChatConfigOverrideRaw(next);
    }

    async setHateMode(value: boolean) {
        await this.patchChat({ hateMode: value });
    }

    async setDisableRepliesDueToRights(value: boolean) {
        const current = (await this.getChatConfigOverride()) ?? {};
        const next: ChatConfigOverride = { ...current };

        if (value) {
            next.disableRepliesDueToRights = true;
        } else {
            delete next.disableRepliesDueToRights;
        }

        await this.setChatConfigOverrideRaw(next);
    }

    async setDisabledReplyRightsLastProbeAt(value?: number) {
        const current = (await this.getChatConfigOverride()) ?? {};
        const next: ChatConfigOverride = { ...current };

        if (value === undefined) {
            delete next.disabledReplyRightsLastProbeAt;
        } else {
            next.disabledReplyRightsLastProbeAt = value;
        }

        await this.setChatConfigOverrideRaw(next);
    }

    async setLocale(value?: string) {
        await this.patchChat({ locale: value ?? null });
    }

    async setCharacter(character?: BotCharacter) {
        if (!character) {
            await this.memory.db.delete(chatCharacters).where(
                eq(chatCharacters.chatId, this.chatInfo.id),
            );
            return;
        }

        await this.memory.db
            .insert(chatCharacters)
            .values({
                chatId: this.chatInfo.id,
                payload: JSON.stringify(character),
                names: JSON.stringify(character.names),
            })
            .onConflictDoUpdate({
                target: [chatCharacters.chatId],
                set: {
                    payload: JSON.stringify(character),
                    names: JSON.stringify(character.names),
                },
            });
    }

    async updateUser(user: User) {
        const member: Member = {
            id: user.id,
            username: user.username,
            first_name: user.first_name,
            info: user,
            description: '',
            lastUse: Date.now(),
        };

        await this.memory.db
            .insert(chatMembers)
            .values({
                chatId: this.chatInfo.id,
                userId: member.id,
                username: member.username,
                firstName: member.first_name,
                description: member.description,
                info: JSON.stringify(member.info),
                lastUse: member.lastUse,
            })
            .onConflictDoUpdate({
                target: [chatMembers.chatId, chatMembers.userId],
                set: {
                    username: member.username,
                    firstName: member.first_name,
                    description: member.description,
                    info: JSON.stringify(member.info),
                    lastUse: member.lastUse,
                },
            });
    }

    async removeMember(userId: number) {
        await this.memory.db.delete(chatMembers).where(and(
            eq(chatMembers.chatId, this.chatInfo.id),
            eq(chatMembers.userId, userId),
        ));
    }

    async updateMessageText(messageId: number, text: string) {
        await this.memory.db
            .update(chatMessages)
            .set({ text })
            .where(and(
                eq(chatMessages.chatId, this.chatInfo.id),
                eq(chatMessages.messageId, messageId),
            ));
    }

    /**
     * Returns list of active members in chat
     * with last use less than N days ago
     */
    async getActiveMembers(days = 7, limit = 10) {
        const chat = await this.getChat();
        const activeMembers = chat.members.filter((m) =>
            m.lastUse > Date.now() - 1000 * 60 * 60 * 24 * days
        );

        return activeMembers.slice(0, limit);
    }

    async addOptOutUser(user: OptOutUser) {
        await this.memory.db
            .insert(chatOptOutUsers)
            .values({
                chatId: this.chatInfo.id,
                userId: user.id,
                username: user.username,
                firstName: user.first_name,
            })
            .onConflictDoUpdate({
                target: [chatOptOutUsers.chatId, chatOptOutUsers.userId],
                set: {
                    username: user.username,
                    firstName: user.first_name,
                },
            });
    }

    async removeOptOutUser(userId: number) {
        await this.memory.db.delete(chatOptOutUsers).where(and(
            eq(chatOptOutUsers.chatId, this.chatInfo.id),
            eq(chatOptOutUsers.userId, userId),
        ));
    }

    async getMessageById(messageId: number) {
        const row = await this.memory.db.query.chatMessages.findFirst({
            where: and(
                eq(chatMessages.chatId, this.chatInfo.id),
                eq(chatMessages.messageId, messageId),
            ),
        });
        if (!row) {
            return undefined;
        }

        const reactionsByMessage = await loadMessageReactions(
            this.memory.db,
            this.chatInfo.id,
            [messageId],
        );
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
            if (message.info.from?.id !== authorId) {
                continue;
            }
            if (message.info.message_thread_id !== topicId) {
                continue;
            }

            return message;
        }

        return undefined;
    }

    async addEmojiReaction(
        messageId: number,
        emoji: string,
        by?: Pick<User, 'id' | 'username' | 'first_name'>,
    ) {
        await this.upsertReaction(messageId, { type: 'emoji', emoji }, by);
    }

    async removeEmojiReaction(
        messageId: number,
        emoji: string,
        by?: Pick<User, 'id' | 'username' | 'first_name'>,
    ) {
        await this.removeReaction(messageId, { type: 'emoji', emoji }, by);
    }

    async applyReactionDelta(
        messageId: number,
        delta: ReactionDelta,
        by?: Pick<User, 'id' | 'username' | 'first_name'>,
    ) {
        for (const emoji of delta.emojiAdded) {
            await this.upsertReaction(messageId, { type: 'emoji', emoji }, by);
        }
        for (const emoji of delta.emojiRemoved) {
            await this.removeReaction(messageId, { type: 'emoji', emoji }, by);
        }
        for (const customEmojiId of delta.customAdded) {
            await this.upsertReaction(messageId, {
                type: 'custom',
                customEmojiId,
            }, by);
        }
        for (const customEmojiId of delta.customRemoved) {
            await this.removeReaction(messageId, {
                type: 'custom',
                customEmojiId,
            }, by);
        }
    }

    async replaceReactionCounts(
        messageId: number,
        counts: ReactionCountEntry[],
    ) {
        const msg = await this.getMessageById(messageId);
        if (!msg) return;

        const nextKeys = new Set(counts.map((c) =>
            reactionKey(
                c.type === 'emoji'
                    ? { type: 'emoji', emoji: c.emoji }
                    : { type: 'custom', customEmojiId: c.customEmojiId },
            )
        ));

        const existingRows = await this.memory.db
            .select({ reactionKey: messageReactions.reactionKey })
            .from(messageReactions)
            .where(and(
                eq(messageReactions.chatId, this.chatInfo.id),
                eq(messageReactions.messageId, messageId),
            ));
        const staleKeys = existingRows
            .map((row) => row.reactionKey)
            .filter((key) => !nextKeys.has(key));

        for (const c of counts) {
            const key = reactionKey(
                c.type === 'emoji'
                    ? { type: 'emoji', emoji: c.emoji }
                    : { type: 'custom', customEmojiId: c.customEmojiId },
            );

            await this.memory.db
                .insert(messageReactions)
                .values({
                    chatId: this.chatInfo.id,
                    messageId,
                    reactionKey: key,
                    type: c.type,
                    emoji: c.type === 'emoji' ? c.emoji : null,
                    customEmojiId: c.type === 'custom' ? c.customEmojiId : null,
                    count: c.total,
                })
                .onConflictDoUpdate({
                    target: [
                        messageReactions.chatId,
                        messageReactions.messageId,
                        messageReactions.reactionKey,
                    ],
                    set: {
                        count: c.total,
                    },
                });

            if (!msg.reactions) msg.reactions = {};
            const existing = msg.reactions[key];
            if (!existing) {
                msg.reactions[key] = {
                    type: c.type,
                    emoji: c.type === 'emoji' ? c.emoji : undefined,
                    customEmojiId: c.type === 'custom'
                        ? c.customEmojiId
                        : undefined,
                    by: [],
                    count: c.total,
                };
            } else {
                existing.count = c.total;
                msg.reactions[key] = existing;
            }
        }

        if (staleKeys.length > 0) {
            await this.memory.db.delete(messageReactionUsers).where(and(
                eq(messageReactionUsers.chatId, this.chatInfo.id),
                eq(messageReactionUsers.messageId, messageId),
                inArray(messageReactionUsers.reactionKey, staleKeys),
            ));
            await this.memory.db.delete(messageReactions).where(and(
                eq(messageReactions.chatId, this.chatInfo.id),
                eq(messageReactions.messageId, messageId),
                inArray(messageReactions.reactionKey, staleKeys),
            ));

            if (msg.reactions) {
                for (const key of staleKeys) {
                    delete msg.reactions[key];
                }
            }
        }
    }

    private async upsertReaction(
        messageId: number,
        reaction:
            | { type: 'emoji'; emoji: string }
            | { type: 'custom'; customEmojiId: string },
        by?: Pick<User, 'id' | 'username' | 'first_name'>,
    ) {
        const msg = await this.getMessageById(messageId);
        if (!msg) return;
        if (!msg.reactions) msg.reactions = {};

        const key = reactionKey(reaction);
        let rec = msg.reactions[key];
        if (!rec) {
            rec = msg.reactions[key] = {
                type: reaction.type,
                emoji: reaction.type === 'emoji' ? reaction.emoji : undefined,
                customEmojiId: reaction.type === 'custom'
                    ? reaction.customEmojiId
                    : undefined,
                by: [],
                count: 0,
            };
        }

        rec.count = Math.max(1, rec.count + 1);
        await this.memory.db
            .insert(messageReactions)
            .values({
                chatId: this.chatInfo.id,
                messageId,
                reactionKey: key,
                type: rec.type,
                emoji: rec.emoji ?? null,
                customEmojiId: rec.customEmojiId ?? null,
                count: rec.count,
            })
            .onConflictDoUpdate({
                target: [
                    messageReactions.chatId,
                    messageReactions.messageId,
                    messageReactions.reactionKey,
                ],
                set: {
                    type: rec.type,
                    emoji: rec.emoji ?? null,
                    customEmojiId: rec.customEmojiId ?? null,
                    count: rec.count,
                },
            });

        if (by) {
            const userRec = {
                id: by.id,
                username: by.username,
                name: by.first_name,
            } as ReactionBy;

            const existingIdx = rec.by.findIndex((u) => u.id === by.id);
            if (existingIdx === -1) rec.by.push(userRec);
            else rec.by[existingIdx] = userRec;

            await this.memory.db
                .insert(messageReactionUsers)
                .values({
                    chatId: this.chatInfo.id,
                    messageId,
                    reactionKey: key,
                    userId: by.id,
                    username: by.username,
                    name: by.first_name,
                })
                .onConflictDoUpdate({
                    target: [
                        messageReactionUsers.chatId,
                        messageReactionUsers.messageId,
                        messageReactionUsers.reactionKey,
                        messageReactionUsers.userId,
                    ],
                    set: {
                        username: by.username,
                        name: by.first_name,
                    },
                });
        }
    }

    private async removeReaction(
        messageId: number,
        reaction:
            | { type: 'emoji'; emoji: string }
            | { type: 'custom'; customEmojiId: string },
        by?: Pick<User, 'id' | 'username' | 'first_name'>,
    ) {
        const msg = await this.getMessageById(messageId);
        if (!msg || !msg.reactions) return;

        const key = reactionKey(reaction);
        const rec = msg.reactions[key];
        if (!rec) return;

        if (by) {
            rec.by = rec.by.filter((u) => u.id !== by.id);
            await this.memory.db.delete(messageReactionUsers).where(and(
                eq(messageReactionUsers.chatId, this.chatInfo.id),
                eq(messageReactionUsers.messageId, messageId),
                eq(messageReactionUsers.reactionKey, key),
                eq(messageReactionUsers.userId, by.id),
            ));
        }

        if (rec.count > 0) rec.count -= 1;
        if (rec.count <= 0 && rec.by.length === 0) {
            delete msg.reactions[key];
            await this.memory.db.delete(messageReactions).where(and(
                eq(messageReactions.chatId, this.chatInfo.id),
                eq(messageReactions.messageId, messageId),
                eq(messageReactions.reactionKey, key),
            ));
            return;
        }

        await this.memory.db
            .update(messageReactions)
            .set({ count: rec.count })
            .where(and(
                eq(messageReactions.chatId, this.chatInfo.id),
                eq(messageReactions.messageId, messageId),
                eq(messageReactions.reactionKey, key),
            ));

        msg.reactions[key] = rec;
    }
}

export async function loadMemory(): Promise<Memory> {
    const memory = new Memory();
    await ensureSqlitePragmas();
    await ensureDatabaseWritable();

    try {
        // Ensure DB connection is valid.
        await memory.db.select({ id: chats.id }).from(chats).limit(1);
    } catch (error) {
        logger.error('Database is not ready: ', error);
        throw error;
    }

    return memory;
}
