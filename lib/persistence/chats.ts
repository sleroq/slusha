import { desc, eq, inArray } from 'drizzle-orm';
import type { Chat as TgChat } from 'grammy_types';
import type { DbClient } from '../db/client.ts';
import {
    chatCharacters,
    chatConfigOverrides,
    chatMembers,
    chatMessages,
    chatOptOutUsers,
    chats,
    messageReactions,
    messageReactionUsers,
} from '../db/schema.ts';
import { ChatConfigRepository } from './chat-config.ts';
import { CharacterRepository } from './characters.ts';
import { MemberRepository } from './members.ts';
import { OptOutRepository } from './opt-outs.ts';
import type { Chat } from './types.ts';

type Tx = Parameters<Parameters<DbClient['transaction']>[0]>[0];

export class ChatRepository {
    constructor(private db: DbClient) {}

    async ensureChat(tgChat: TgChat) {
        await this.db.insert(chats).values({
            id: tgChat.id,
            info: JSON.stringify(tgChat),
            lastUse: Date.now(),
        }).onConflictDoNothing();
    }

    async getChatById(chatId: number): Promise<Chat | undefined> {
        const characters = new CharacterRepository(this.db, chatId);
        const optOuts = new OptOutRepository(this.db, chatId);
        const members = new MemberRepository(this.db, chatId);

        const chatRow = await this.db.query.chats.findFirst({
            where: eq(chats.id, chatId),
        });
        if (!chatRow) return undefined;

        const chatConfig = new ChatConfigRepository(this.db, chatId);
        const [chatState, character, optOutUsers, chatMembersList] =
            await Promise.all([
                chatConfig.getChatState(),
                characters.get(),
                optOuts.list(),
                members.list(),
            ]);

        return {
            history: [],
            lastUse: chatRow.lastUse,
            info: JSON.parse(chatRow.info) as TgChat,
            chatModel: undefined,
            character,
            optOutUsers,
            members: chatMembersList,
            messagesToPass: undefined,
            randomReplyProbability: undefined,
            hateMode: chatRow.hateMode ?? undefined,
            locale: chatRow.locale ?? undefined,
            disableRepliesDueToRights: chatState
                ?.disableRepliesDueToRights,
            disabledReplyRightsLastProbeAt: chatState
                ?.disabledReplyRightsLastProbeAt,
        };
    }

    async getChat(tgChat: TgChat): Promise<Chat> {
        await this.ensureChat(tgChat);
        const chat = await this.getChatById(tgChat.id);
        if (!chat) throw new Error(`Could not load chat ${tgChat.id}`);
        return chat;
    }

    async patchChat(
        chatId: number,
        patch: Partial<
            { lastUse: number; hateMode: boolean | null; locale: string | null }
        >,
    ) {
        await this.db.update(chats).set(patch).where(eq(chats.id, chatId));
    }

    async migrateChat(from: number, to: number, toInfo: TgChat) {
        if (from === to) return;
        await this.db.transaction(async (tx: Tx) => {
            const fromChat = await tx.query.chats.findFirst({
                where: eq(chats.id, from),
            });
            if (!fromChat) {
                await tx.insert(chats).values({
                    id: to,
                    info: JSON.stringify(toInfo),
                    lastUse: Date.now(),
                }).onConflictDoNothing();
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
                hateMode: fromChat.hateMode,
                locale: fromChat.locale,
            });
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

    async listAvailableChats() {
        return await this.db.select({ id: chats.id, info: chats.info })
            .from(chats)
            .orderBy(desc(chats.lastUse));
    }

    async listChatsForMember(userId: number) {
        const memberRows = await this.db.select({
            chatId: chatMembers.chatId,
            lastUse: chatMembers.lastUse,
        })
            .from(chatMembers)
            .where(eq(chatMembers.userId, userId))
            .orderBy(desc(chatMembers.lastUse));
        if (memberRows.length === 0) return [];
        const chatRows = await this.db.select({
            id: chats.id,
            info: chats.info,
        })
            .from(chats)
            .where(inArray(chats.id, memberRows.map((row) => row.chatId)));
        const chatMap = new Map(chatRows.map((row) => [row.id, row]));
        return memberRows.map(({ chatId }) => chatMap.get(chatId)).filter((
            row,
        ): row is { id: number; info: string } => Boolean(row));
    }
}
