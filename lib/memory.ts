import { and, asc, eq, inArray } from 'drizzle-orm';
import { Chat as TgChat, Message, User } from 'grammy_types';
import { Character } from './charhub/api.ts';
import { DbClient, ensureSqlitePragmas, getDb } from './db/client.ts';
import {
    chatConfigOverrides,
    chatCharacters,
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
    chatConfigOverrideSchema,
    ChatConfigOverride,
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
                info: row.replyToInfo ? parseJson<ReplyMessage>(row.replyToInfo) :
                    ({} as ReplyMessage),
            }
            : undefined,
        reactions,
    };
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

    private async getMessageReactions(chatId: number) {
        const reactionRows = await this.db
            .select()
            .from(messageReactions)
            .where(eq(messageReactions.chatId, chatId));

        const keys = reactionRows.map((r: typeof messageReactions.$inferSelect) =>
            r.reactionKey
        );
        const usersRows = keys.length === 0 ? [] : await this.db
            .select()
            .from(messageReactionUsers)
            .where(and(
                eq(messageReactionUsers.chatId, chatId),
                inArray(messageReactionUsers.reactionKey, keys),
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
                by: usersByReaction.get(`${row.messageId}:${row.reactionKey}`) ?? [],
                count: row.count,
            };
            reactionsByMessage.set(row.messageId, bucket);
        }

        return reactionsByMessage;
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
            messagesRows,
            characterRow,
            reactionsByMessage,
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
            this.db
                .select()
                .from(chatMessages)
                .where(eq(chatMessages.chatId, chatId))
                .orderBy(asc(chatMessages.messageId)),
            this.db.query.chatCharacters.findFirst({
                where: eq(chatCharacters.chatId, chatId),
            }),
            this.getMessageReactions(chatId),
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
            history: messagesRows.map((m: typeof chatMessages.$inferSelect) =>
                buildMessageFromRow(m, reactionsByMessage.get(m.messageId))
            ),
            memory: chatRow.memory ?? undefined,
            lastUse: chatRow.lastUse,
            info: parseJson<TgChat>(chatRow.info),
            chatModel: configOverride?.ai?.model ?? chatRow.chatModel ?? undefined,
            character: characterRow
                ? {
                    ...parseJson<Character>(characterRow.payload),
                    names: parseJson<string[]>(characterRow.names),
                }
                : undefined,
            optOutUsers: optOutRows.map((u: typeof chatOptOutUsers.$inferSelect) => ({
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
            messagesToPass: configOverride?.ai?.messagesToPass ??
                chatRow.messagesToPass ?? undefined,
            randomReplyProbability: configOverride?.randomReplyProbability ??
                chatRow.randomReplyProbability ?? undefined,
            hateMode: chatRow.hateMode ?? undefined,
            locale: chatRow.locale ?? undefined,
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
            const fromChat = await tx.query.chats.findFirst({ where: eq(chats.id, from) });
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

            await tx.delete(messageReactionUsers).where(eq(messageReactionUsers.chatId, to));
            await tx.delete(chats).where(eq(chats.id, to));

            await tx.insert(chats).values({
                id: to,
                info: JSON.stringify(toInfo),
                lastUse: fromChat.lastUse,
                lastNotes: fromChat.lastNotes,
                lastMemory: fromChat.lastMemory,
                memory: fromChat.memory,
                chatModel: fromChat.chatModel,
                messagesToPass: fromChat.messagesToPass,
                randomReplyProbability: fromChat.randomReplyProbability,
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

            await tx.delete(chats).where(eq(chats.id, from));
        });
    }

    async save() {
        // DB is source of truth now.
    }
}

// Class avalivle when handling message
// with functionality specific to current chat
// like get previous messages from this user, get last notes, etc
export class ChatMemory {
    memory: Memory;
    chatInfo: TgChat;
    private cache?: Chat;

    constructor(memory: Memory, chat: TgChat) {
        this.memory = memory;
        this.chatInfo = chat;
    }

    async getChat() {
        if (!this.cache) {
            this.cache = await this.memory.getChat(this.chatInfo);
        }

        return this.cache;
    }

    private async patchChat(
        patch: Partial<{
            lastUse: number;
            lastNotes: number;
            lastMemory: number;
            memory: string | null;
            chatModel: string | null;
            messagesToPass: number | null;
            randomReplyProbability: number | null;
            hateMode: boolean | null;
            locale: string | null;
        }>,
    ) {
        await this.memory.db.update(chats).set(patch).where(eq(chats.id, this.chatInfo.id));
        if (this.cache) {
            if (patch.lastUse !== undefined) this.cache.lastUse = patch.lastUse;
            if (patch.lastNotes !== undefined) this.cache.lastNotes = patch.lastNotes;
            if (patch.lastMemory !== undefined) this.cache.lastMemory = patch.lastMemory;
            if (patch.memory !== undefined) this.cache.memory = patch.memory ?? undefined;
            if (patch.chatModel !== undefined) this.cache.chatModel = patch.chatModel ?? undefined;
            if (patch.messagesToPass !== undefined) {
                this.cache.messagesToPass = patch.messagesToPass ?? undefined;
            }
            if (patch.randomReplyProbability !== undefined) {
                this.cache.randomReplyProbability = patch.randomReplyProbability ??
                    undefined;
            }
            if (patch.hateMode !== undefined) this.cache.hateMode = patch.hateMode ?? undefined;
            if (patch.locale !== undefined) this.cache.locale = patch.locale ?? undefined;
        }
    }

    async getChatConfigOverride(): Promise<ChatConfigOverride | undefined> {
        const row = await this.memory.db.query.chatConfigOverrides.findFirst({
            where: eq(chatConfigOverrides.chatId, this.chatInfo.id),
        });

        if (!row) return undefined;
        return parseChatOverridePayload(row.payload);
    }

    private isOverrideEmpty(value: ChatConfigOverride) {
        const noAi = !value.ai || Object.keys(value.ai).length === 0;
        const rest = Object.entries(value).filter(([key]) => key !== 'ai');
        return noAi && rest.length === 0;
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

    async setChatConfigOverride(value: ChatConfigOverride | undefined, updatedBy?: number) {
        if (value === undefined) {
            await this.setChatConfigOverrideRaw(undefined, updatedBy);
            return;
        }

        const parsed = chatConfigOverrideSchema.safeParse(value);
        if (!parsed.success) {
            throw new Error('Invalid chat config override payload: ' + parsed.error.message);
        }

        await this.setChatConfigOverrideRaw(parsed.data, updatedBy);
    }

    async getEffectiveConfig(base: UserConfig) {
        const override = await this.getChatConfigOverride();
        return mergeWithChatOverride(base, override);
    }

    async getHistory() {
        return (await this.getChat()).history;
    }

    async clear() {
        await this.memory.db.transaction(async (tx: Tx) => {
            await tx.delete(messageReactionUsers).where(
                eq(messageReactionUsers.chatId, this.chatInfo.id),
            );
            await tx.delete(messageReactions).where(
                eq(messageReactions.chatId, this.chatInfo.id),
            );
            await tx.delete(chatMessages).where(eq(chatMessages.chatId, this.chatInfo.id));
            await tx.update(chats).set({ lastNotes: 0 }).where(eq(chats.id, this.chatInfo.id));
        });

        if (this.cache) {
            this.cache.history = [];
            this.cache.lastNotes = 0;
        }
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
                    info: JSON.stringify(message.info),
                },
            });

        if (this.cache) {
            const i = this.cache.history.findIndex((m) => m.id === message.id);
            if (i === -1) this.cache.history.push(message);
            else this.cache.history[i] = message;
        }
    }

    async removeOldMessages(maxLength: number) {
        const history = await this.getHistory();
        if (history.length <= maxLength) return;

        const toDelete = history.slice(0, history.length - maxLength).map((m) => m.id);
        await this.memory.db.transaction(async (tx: Tx) => {
            await tx.delete(messageReactionUsers).where(and(
                eq(messageReactionUsers.chatId, this.chatInfo.id),
                inArray(messageReactionUsers.messageId, toDelete),
            ));
            await tx.delete(messageReactions).where(and(
                eq(messageReactions.chatId, this.chatInfo.id),
                inArray(messageReactions.messageId, toDelete),
            ));
            await tx.delete(chatMessages).where(and(
                eq(chatMessages.chatId, this.chatInfo.id),
                inArray(chatMessages.messageId, toDelete),
            ));
        });

        if (this.cache) {
            this.cache.history = this.cache.history.slice(this.cache.history.length - maxLength);
        }
    }

    async removeOldNotes(maxLength: number) {
        const chat = await this.getChat();
        if (chat.notes.length <= maxLength) return;

        const nextNotes = chat.notes.slice(chat.notes.length - maxLength);
        await this.replaceNotes(nextNotes);
    }

    private async replaceNotes(notes: string[]) {
        await this.memory.db.transaction(async (tx: Tx) => {
            await tx.delete(chatNotes).where(eq(chatNotes.chatId, this.chatInfo.id));
            if (notes.length > 0) {
                await tx.insert(chatNotes).values(notes.map((note, index) => ({
                    chatId: this.chatInfo.id,
                    noteIndex: index,
                    text: note,
                })));
            }
        });

        if (this.cache) {
            this.cache.notes = notes;
        }
    }

    async addNote(note: string) {
        const chat = await this.getChat();
        const notes = [...chat.notes, note];
        await this.replaceNotes(notes);
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
        await this.memory.db.delete(chatNotes).where(eq(chatNotes.chatId, this.chatInfo.id));

        if (this.cache) {
            this.cache.notes = [];
        }
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
        await this.patchChat({ chatModel: value ?? null });
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
        await this.patchChat({ messagesToPass: value ?? null });
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
        await this.patchChat({ randomReplyProbability: value ?? null });
    }

    async setHateMode(value: boolean) {
        await this.patchChat({ hateMode: value });
    }

    async setLocale(value?: string) {
        await this.patchChat({ locale: value ?? null });
    }

    async setCharacter(character?: BotCharacter) {
        if (!character) {
            await this.memory.db.delete(chatCharacters).where(
                eq(chatCharacters.chatId, this.chatInfo.id),
            );
            if (this.cache) this.cache.character = undefined;
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

        if (this.cache) this.cache.character = character;
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

        if (this.cache) {
            const idx = this.cache.members.findIndex((m) => m.id === member.id);
            if (idx === -1) this.cache.members.push(member);
            else this.cache.members[idx] = member;
        }
    }

    async removeMember(userId: number) {
        await this.memory.db.delete(chatMembers).where(and(
            eq(chatMembers.chatId, this.chatInfo.id),
            eq(chatMembers.userId, userId),
        ));

        if (this.cache) {
            this.cache.members = this.cache.members.filter((m) => m.id !== userId);
        }
    }

    async updateMessageText(messageId: number, text: string) {
        await this.memory.db
            .update(chatMessages)
            .set({ text })
            .where(and(
                eq(chatMessages.chatId, this.chatInfo.id),
                eq(chatMessages.messageId, messageId),
            ));

        if (this.cache) {
            const msg = this.cache.history.find((m) => m.id === messageId);
            if (msg) msg.text = text;
        }
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

        if (this.cache) {
            const idx = this.cache.optOutUsers.findIndex((u) => u.id === user.id);
            if (idx === -1) this.cache.optOutUsers.push(user);
            else this.cache.optOutUsers[idx] = user;
        }
    }

    async removeOptOutUser(userId: number) {
        await this.memory.db.delete(chatOptOutUsers).where(and(
            eq(chatOptOutUsers.chatId, this.chatInfo.id),
            eq(chatOptOutUsers.userId, userId),
        ));

        if (this.cache) {
            this.cache.optOutUsers = this.cache.optOutUsers.filter((u) => u.id !== userId);
        }
    }

    async getMessageById(messageId: number) {
        return (await this.getHistory()).find((m) => m.id === messageId);
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

    async addCustomReaction(
        messageId: number,
        customEmojiId: string,
        by?: Pick<User, 'id' | 'username' | 'first_name'>,
    ) {
        await this.upsertReaction(messageId, { type: 'custom', customEmojiId }, by);
    }

    async removeCustomReaction(
        messageId: number,
        customEmojiId: string,
        by?: Pick<User, 'id' | 'username' | 'first_name'>,
    ) {
        await this.removeReaction(messageId, { type: 'custom', customEmojiId }, by);
    }

    async setReactionCounts(
        messageId: number,
        counts: ReactionCountEntry[],
    ) {
        await this.replaceReactionCounts(messageId, counts);
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
            await this.upsertReaction(messageId, { type: 'custom', customEmojiId }, by);
        }
        for (const customEmojiId of delta.customRemoved) {
            await this.removeReaction(messageId, { type: 'custom', customEmojiId }, by);
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
                    customEmojiId: c.type === 'custom' ? c.customEmojiId : undefined,
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

    try {
        // Ensure DB file is writable and connection is valid.
        await memory.db.select({ id: chats.id }).from(chats).limit(1);
    } catch (error) {
        logger.error('Database is not ready: ', error);
        throw error;
    }

    return memory;
}
