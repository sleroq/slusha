import type { OptOutUser } from '../memory.ts';

import { getPrismaClient } from './client.ts';

export async function addOptOut(chatId: bigint, user: OptOutUser) {
    const prisma = getPrismaClient();

    await prisma.optOutUser.upsert({
        where: {
            chatId_telegramId: {
                chatId,
                telegramId: BigInt(user.id),
            },
        },
        create: {
            chatId,
            telegramId: BigInt(user.id),
            username: user.username,
            firstName: user.first_name,
        },
        update: {
            username: user.username,
            firstName: user.first_name,
        },
    });
}

export async function removeOptOut(chatId: bigint, telegramId: bigint) {
    const prisma = getPrismaClient();

    await prisma.optOutUser.deleteMany({
        where: {
            chatId,
            telegramId,
        },
    });
}

export async function isOptedOut(chatId: bigint, telegramId: bigint) {
    const prisma = getPrismaClient();

    const rec = await prisma.optOutUser.findUnique({
        where: {
            chatId_telegramId: {
                chatId,
                telegramId,
            },
        },
        select: { id: true },
    });

    return rec !== null;
}

export async function getOptOutUsers(chatId: bigint) {
    const prisma = getPrismaClient();

    return await prisma.optOutUser.findMany({
        where: {
            chatId,
        },
    });
}
