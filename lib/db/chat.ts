import type { Chat as TgChat } from 'grammy_types';

import { getPrismaClient } from './client.ts';

function safeString(v: unknown): string | undefined {
    return typeof v === 'string' && v.trim().length > 0 ? v : undefined;
}

export async function getOrCreateChat(tgChat: TgChat) {
    const prisma = getPrismaClient();

    const chatId = BigInt(tgChat.id);
    const type = tgChat.type;

    const title = 'title' in tgChat
        ? safeString((tgChat as { title?: unknown }).title)
        : undefined;
    const firstName = 'first_name' in tgChat
        ? safeString((tgChat as { first_name?: unknown }).first_name)
        : undefined;
    const username = 'username' in tgChat
        ? safeString((tgChat as { username?: unknown }).username)
        : undefined;

    return await prisma.chat.upsert({
        where: { id: chatId },
        create: {
            id: chatId,
            type,
            title,
            firstName,
            username,
            telegramInfo: tgChat as unknown as object,
        },
        update: {
            type,
            title,
            firstName,
            username,
            telegramInfo: tgChat as unknown as object,
            lastUse: new Date(),
        },
    });
}

export async function updateChat(
    chatId: bigint,
    data: {
        notes?: string[];
        lastNotesMessageId?: number | null;
        lastMemoryMessageId?: number | null;
        memory?: string | null;
        historyStartAt?: Date | null;
        lastUse?: Date;
        chatModel?: string | null;
        character?: unknown;
        messagesToPass?: number | null;
        randomReplyProbability?: number | null;
        hateMode?: boolean;
        locale?: string | null;
        telegramInfo?: unknown;
        type?: string;
        title?: string | null;
        firstName?: string | null;
        username?: string | null;
    },
) {
    const prisma = getPrismaClient();

    return await prisma.chat.update({
        where: { id: chatId },
        data: {
            notes: data.notes,
            lastNotesMessageId: data.lastNotesMessageId ?? undefined,
            lastMemoryMessageId: data.lastMemoryMessageId ?? undefined,
            memory: data.memory ?? undefined,
            historyStartAt: data.historyStartAt ?? undefined,
            lastUse: data.lastUse,
            chatModel: data.chatModel ?? undefined,
            character: data.character as object | undefined,
            messagesToPass: data.messagesToPass ?? undefined,
            randomReplyProbability: data.randomReplyProbability ?? undefined,
            hateMode: data.hateMode,
            locale: data.locale ?? undefined,
            telegramInfo: (data.telegramInfo as object | undefined),
            type: data.type,
            title: data.title ?? undefined,
            firstName: data.firstName ?? undefined,
            username: data.username ?? undefined,
        },
    });
}

export async function getChatById(chatId: bigint) {
    const prisma = getPrismaClient();

    return await prisma.chat.findUnique({
        where: { id: chatId },
    });
}
