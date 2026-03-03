import type { Message as TgMessage, User } from 'grammy_types';
import type { Prisma } from '../../generated/prisma/client.ts';

import { getPrismaClient } from './client.ts';
import { makeMessageReactions, toMemoryChatMessage } from './types.ts';

export type DbMessageWithReactions = Prisma.MessageGetPayload<{
    include: { reactions: true };
}>;

export interface CreateMessageInput {
    telegramId: number;
    text: string;
    isMyself: boolean;
    date: Date;
    telegramInfo: TgMessage;
    replyToTelegramId?: number;
    replyToText?: string;
    sender?: Pick<User, 'id' | 'username' | 'first_name'>;
    caption?: string;
}

export async function addMessage(chatId: bigint, message: CreateMessageInput) {
    const prisma = getPrismaClient();

    return await prisma.message.create({
        data: {
            chatId,
            telegramId: message.telegramId,
            text: message.text,
            isMyself: message.isMyself,
            date: message.date,
            caption: message.caption,
            senderId: message.sender ? BigInt(message.sender.id) : undefined,
            senderUsername: message.sender?.username,
            senderFirstName: message.sender?.first_name,
            replyToTelegramId: message.replyToTelegramId,
            replyToText: message.replyToText,
            telegramInfo: message.telegramInfo as unknown as object,
        },
    });
}

export async function getMessages(
    chatId: bigint,
    limit: number,
): Promise<DbMessageWithReactions[]> {
    const prisma = getPrismaClient();

    return await prisma.message.findMany({
        where: { chatId },
        orderBy: { date: 'asc' },
        take: limit,
        include: {
            reactions: true,
        },
    });
}

export async function getMessageByTelegramId(
    chatId: bigint,
    telegramId: number,
): Promise<DbMessageWithReactions | null> {
    const prisma = getPrismaClient();

    return await prisma.message.findUnique({
        where: {
            chatId_telegramId: {
                chatId,
                telegramId,
            },
        },
        include: { reactions: true },
    });
}

export async function updateMessageText(
    chatId: bigint,
    telegramId: number,
    text: string,
) {
    const prisma = getPrismaClient();

    await prisma.message.update({
        where: {
            chatId_telegramId: {
                chatId,
                telegramId,
            },
        },
        data: {
            text,
        },
    });
}

export function toMemoryMessage(dbMessage: {
    telegramId: number;
    text: string;
    isMyself: boolean;
    telegramInfo: unknown;
    reactions?: Array<{
        type: string;
        emoji: string | null;
        customEmojiId: string | null;
        userId: bigint | null;
        userUsername: string | null;
        userFirstName: string | null;
    }>;
}) {
    const reactionRecords = (dbMessage.reactions ?? []).map((r) => {
        const by = r.userId
            ? [{
                id: Number(r.userId),
                username: r.userUsername ?? undefined,
                name: r.userFirstName ?? 'User',
            }]
            : [];

        return {
            type: r.type as 'emoji' | 'custom',
            emoji: r.emoji ?? undefined,
            customEmojiId: r.customEmojiId ?? undefined,
            by,
            count: 1,
        };
    });

    const reactions = makeMessageReactions(reactionRecords);

    return toMemoryChatMessage({
        telegramId: dbMessage.telegramId,
        text: dbMessage.text,
        isMyself: dbMessage.isMyself,
        telegramInfo: dbMessage.telegramInfo,
        reactions,
    });
}
