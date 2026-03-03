import type { User } from 'grammy_types';

import { getPrismaClient } from './client.ts';

export async function upsertMember(chatId: bigint, user: User) {
    const prisma = getPrismaClient();

    const telegramId = BigInt(user.id);

    return await prisma.member.upsert({
        where: {
            chatId_telegramId: {
                chatId,
                telegramId,
            },
        },
        create: {
            chatId,
            telegramId,
            username: user.username,
            firstName: user.first_name,
            description: '',
            lastUse: new Date(),
            telegramInfo: user as unknown as object,
        },
        update: {
            username: user.username,
            firstName: user.first_name,
            lastUse: new Date(),
            telegramInfo: user as unknown as object,
        },
    });
}

export async function removeMember(chatId: bigint, telegramId: bigint) {
    const prisma = getPrismaClient();

    await prisma.member.deleteMany({
        where: {
            chatId,
            telegramId,
        },
    });
}

export async function getActiveMembers(
    chatId: bigint,
    days: number,
    limit: number,
) {
    const prisma = getPrismaClient();

    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    return await prisma.member.findMany({
        where: {
            chatId,
            lastUse: {
                gt: since,
            },
        },
        orderBy: {
            lastUse: 'desc',
        },
        take: limit,
    });
}
