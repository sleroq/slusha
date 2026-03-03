import { Chat as TgChat, Message as TgMessage, User } from 'grammy_types';
import type {
    Chat as DbChat,
    Member as DbMember,
    OptOutUser as DbOptOutUser,
    Reaction as DbReaction,
} from '../generated/prisma/client.ts';

import logger from './logger.ts';
import { ReplyMessage } from './telegram/helpers.ts';
import { Character } from './charhub/api.ts';

import { getChatById, getOrCreateChat, updateChat } from './db/chat.ts';
import {
    addMessage as dbAddMessage,
    type DbMessageWithReactions,
    getMessageByTelegramId as dbGetMessageByTelegramId,
    getMessages as dbGetMessages,
    updateMessageText as dbUpdateMessageText,
} from './db/message.ts';
import {
    addReaction as dbAddReaction,
    getReactionsForMessage as dbGetReactionsForMessage,
    removeReaction as dbRemoveReaction,
    toMemoryReactions,
} from './db/reaction.ts';
import {
    getActiveMembers as dbGetActiveMembers,
    removeMember as dbRemoveMember,
    upsertMember,
} from './db/member.ts';
import {
    addOptOut as dbAddOptOut,
    getOptOutUsers as dbGetOptOutUsers,
    isOptedOut as dbIsOptedOut,
    removeOptOut as dbRemoveOptOut,
} from './db/optout.ts';

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

export type MessageReactions = { [key: string]: ReactionRecord };

export interface ChatMessage {
    id: number;
    text: string;
    replyTo?: ReplyTo;
    isMyself: boolean;
    info: TgMessage;
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

export class Memory {
    async getChat(tgChat: TgChat): Promise<DbChat> {
        return await getOrCreateChat(tgChat);
    }
}

export class ChatMemory {
    memory: Memory;
    chatInfo: TgChat;

    constructor(memory: Memory, chat: TgChat) {
        this.memory = memory;
        this.chatInfo = chat;
    }

    private get chatId(): bigint {
        return BigInt(this.chatInfo.id);
    }

    async getChat() {
        const chat = await this.memory.getChat(this.chatInfo);

        const optOutUsers: DbOptOutUser[] = await dbGetOptOutUsers(chat.id);
        const members: DbMember[] = await dbGetActiveMembers(
            chat.id,
            3650,
            1000,
        );

        const info = chat.telegramInfo as unknown as TgChat;

        return {
            notes: chat.notes,
            lastNotes: chat.lastNotesMessageId ?? 0,
            lastMemory: chat.lastMemoryMessageId ?? 0,
            history: [],
            memory: chat.memory ?? undefined,
            lastUse: chat.lastUse.getTime(),
            info,
            chatModel: chat.chatModel ?? undefined,
            character: chat.character as unknown as BotCharacter | undefined,
            messagesToPass: chat.messagesToPass ?? undefined,
            randomReplyProbability: chat.randomReplyProbability ?? undefined,
            hateMode: chat.hateMode,
            locale: chat.locale ?? undefined,
            optOutUsers: optOutUsers.map((u) => ({
                id: Number(u.telegramId),
                username: u.username ?? undefined,
                first_name: u.firstName,
            })),
            members: members.map((m) => ({
                id: Number(m.telegramId),
                username: m.username ?? undefined,
                first_name: m.firstName,
                description: m.description,
                info: m.telegramInfo as unknown as User,
                lastUse: m.lastUse.getTime(),
            })),
        } satisfies Chat;
    }

    async getHistory(limit = 0) {
        const chat = await this.memory.getChat(this.chatInfo);

        const take = limit > 0 ? limit : 100;
        const msgs: DbMessageWithReactions[] = await dbGetMessages(
            chat.id,
            take,
        );

        const filtered = chat.historyStartAt
            ? msgs.filter((m) => m.date > chat.historyStartAt!)
            : msgs;

        return filtered.map((m): ChatMessage => {
            return {
                id: m.telegramId,
                text: m.text,
                isMyself: m.isMyself,
                info: m.telegramInfo as unknown as TgMessage,
                reactions: toMemoryReactions(
                    (m.reactions ?? []).map((r: DbReaction) => ({
                        type: r.type,
                        emoji: r.emoji ?? null,
                        customEmojiId: r.customEmojiId ?? null,
                        userId: r.userId,
                        userUsername: r.userUsername ?? null,
                        userFirstName: r.userFirstName ?? null,
                    })),
                ),
            };
        });
    }

    async clear() {
        const chat = await this.memory.getChat(this.chatInfo);

        await updateChat(chat.id, {
            historyStartAt: new Date(),
            lastNotesMessageId: 0,
        });
    }

    async getLastMessage() {
        const history = await this.getHistory(1);
        return history.slice(-1)[0];
    }

    async addMessage(message: ChatMessage) {
        const chat = await this.memory.getChat(this.chatInfo);

        await dbAddMessage(chat.id, {
            telegramId: message.id,
            text: message.text,
            isMyself: message.isMyself,
            date: new Date(message.info.date * 1000),
            telegramInfo: message.info,
            sender: message.info.from
                ? {
                    id: message.info.from.id,
                    username: message.info.from.username,
                    first_name: message.info.from.first_name,
                }
                : undefined,
            caption: message.info.caption ?? undefined,
            replyToTelegramId: message.replyTo?.id,
            replyToText: message.replyTo?.text,
        });
    }

    removeOldMessages(_maxLength: number) {
        return;
    }

    async removeOldNotes(maxLength: number) {
        const chat = await this.memory.getChat(this.chatInfo);

        if (chat.notes.length <= maxLength) {
            return;
        }

        const trimmed = chat.notes.slice(-maxLength);
        await updateChat(chat.id, { notes: trimmed });
    }

    async updateUser(user: User) {
        const chat = await this.memory.getChat(this.chatInfo);
        await upsertMember(chat.id, user);
    }

    async removeMember(userId: number) {
        const chat = await this.memory.getChat(this.chatInfo);
        await dbRemoveMember(chat.id, BigInt(userId));
    }

    async getActiveMembers(days = 7, limit = 10) {
        const chat = await this.memory.getChat(this.chatInfo);
        const members: DbMember[] = await dbGetActiveMembers(
            chat.id,
            days,
            limit,
        );

        return members.map((m) => ({
            id: Number(m.telegramId),
            username: m.username ?? undefined,
            first_name: m.firstName,
            description: m.description,
            info: m.telegramInfo as unknown as User,
            lastUse: m.lastUse.getTime(),
        })) satisfies Member[];
    }

    async getMessageById(messageId: number) {
        const chat = await this.memory.getChat(this.chatInfo);
        const msg = await dbGetMessageByTelegramId(chat.id, messageId);
        if (!msg) return undefined;

        const reactions: DbReaction[] = await dbGetReactionsForMessage(msg.id);

        return {
            id: msg.telegramId,
            text: msg.text,
            isMyself: msg.isMyself,
            info: msg.telegramInfo as unknown as TgMessage,
            reactions: toMemoryReactions(
                reactions.map((r) => ({
                    type: r.type,
                    emoji: r.emoji ?? null,
                    customEmojiId: r.customEmojiId ?? null,
                    userId: r.userId,
                    userUsername: r.userUsername ?? null,
                    userFirstName: r.userFirstName ?? null,
                })),
            ),
        } satisfies ChatMessage;
    }

    async addEmojiReaction(
        messageId: number,
        emoji: string,
        by?: Pick<User, 'id' | 'username' | 'first_name'>,
    ) {
        const chat = await this.memory.getChat(this.chatInfo);
        const msg = await dbGetMessageByTelegramId(chat.id, messageId);
        if (!msg) return;

        try {
            await dbAddReaction(msg.id, { type: 'emoji', emoji, by });
        } catch (error) {
            logger.warn('Could not add reaction: ', error);
        }
    }

    async removeEmojiReaction(
        messageId: number,
        emoji: string,
        by?: Pick<User, 'id' | 'username' | 'first_name'>,
    ) {
        const chat = await this.memory.getChat(this.chatInfo);
        const msg = await dbGetMessageByTelegramId(chat.id, messageId);
        if (!msg) return;

        await dbRemoveReaction(msg.id, { type: 'emoji', emoji, by });
    }

    async addCustomReaction(
        messageId: number,
        customEmojiId: string,
        by?: Pick<User, 'id' | 'username' | 'first_name'>,
    ) {
        const chat = await this.memory.getChat(this.chatInfo);
        const msg = await dbGetMessageByTelegramId(chat.id, messageId);
        if (!msg) return;

        try {
            await dbAddReaction(msg.id, { type: 'custom', customEmojiId, by });
        } catch (error) {
            logger.warn('Could not add custom reaction: ', error);
        }
    }

    async removeCustomReaction(
        messageId: number,
        customEmojiId: string,
        by?: Pick<User, 'id' | 'username' | 'first_name'>,
    ) {
        const chat = await this.memory.getChat(this.chatInfo);
        const msg = await dbGetMessageByTelegramId(chat.id, messageId);
        if (!msg) return;

        await dbRemoveReaction(msg.id, { type: 'custom', customEmojiId, by });
    }

    setReactionCounts(
        _messageId: number,
        _counts: Array<
            | { type: 'emoji'; emoji: string; total: number }
            | { type: 'custom'; customEmojiId: string; total: number }
        >,
    ) {
        return;
    }

    async isOptedOut(userId: number) {
        const chat = await this.memory.getChat(this.chatInfo);
        return await dbIsOptedOut(chat.id, BigInt(userId));
    }

    async addOptOutUser(user: OptOutUser) {
        const chat = await this.memory.getChat(this.chatInfo);
        await dbAddOptOut(chat.id, user);
    }

    async removeOptOutUser(userId: number) {
        const chat = await this.memory.getChat(this.chatInfo);
        await dbRemoveOptOut(chat.id, BigInt(userId));
    }

    async setChatFields(fields: {
        lastUse?: number;
        hateMode?: boolean;
        locale?: string;
        chatModel?: string | null;
        messagesToPass?: number | null;
        randomReplyProbability?: number | null;
        memory?: string | null;
        notes?: string[];
        lastNotes?: number;
        lastMemory?: number;
        character?: BotCharacter | null;
    }) {
        const chat = await this.memory.getChat(this.chatInfo);

        await updateChat(chat.id, {
            lastUse: typeof fields.lastUse === 'number'
                ? new Date(fields.lastUse)
                : undefined,
            hateMode: fields.hateMode,
            locale: fields.locale ?? undefined,
            chatModel: fields.chatModel ?? undefined,
            messagesToPass: fields.messagesToPass ?? undefined,
            randomReplyProbability: fields.randomReplyProbability ?? undefined,
            memory: fields.memory ?? undefined,
            notes: fields.notes,
            lastNotesMessageId: fields.lastNotes ?? undefined,
            lastMemoryMessageId: fields.lastMemory ?? undefined,
            character: fields.character as unknown as object | undefined,
        });
    }

    async migrateFromChatId(fromChatId: number) {
        const from = await getChatById(BigInt(fromChatId));
        if (!from) {
            return;
        }

        await updateChat(this.chatId, {
            notes: from.notes,
            lastNotesMessageId: from.lastNotesMessageId,
            lastMemoryMessageId: from.lastMemoryMessageId,
            memory: from.memory,
            lastUse: from.lastUse,
            chatModel: from.chatModel,
            character: from.character,
            messagesToPass: from.messagesToPass,
            randomReplyProbability: from.randomReplyProbability,
            hateMode: from.hateMode,
            locale: from.locale,
            telegramInfo: from.telegramInfo,
            historyStartAt: from.historyStartAt,
        });
    }

    async updateEditedMessageText(telegramId: number, text: string) {
        const chat = await this.memory.getChat(this.chatInfo);
        await dbUpdateMessageText(chat.id, telegramId, text);
    }
}

export function loadMemory(): Memory {
    return new Memory();
}
