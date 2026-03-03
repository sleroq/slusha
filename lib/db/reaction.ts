import type { User } from 'grammy_types';

import { getPrismaClient } from './client.ts';
import type { MessageReactions, ReactionRecord } from '../memory.ts';

export interface CreateReactionInput {
    type: 'emoji' | 'custom';
    emoji?: string;
    customEmojiId?: string;
    by?: Pick<User, 'id' | 'username' | 'first_name'>;
}

export interface RemoveReactionInput {
    type: 'emoji' | 'custom';
    emoji?: string;
    customEmojiId?: string;
    by?: Pick<User, 'id' | 'username' | 'first_name'>;
}

function keyOf(rec: ReactionRecord): string | undefined {
    if (rec.type === 'emoji' && rec.emoji) {
        return `e:${rec.emoji}`;
    }
    if (rec.type === 'custom' && rec.customEmojiId) {
        return `c:${rec.customEmojiId}`;
    }
    return undefined;
}

export function toMemoryReactions(
    reactions: Array<{
        type: string;
        emoji: string | null;
        customEmojiId: string | null;
        userId: bigint | null;
        userUsername: string | null;
        userFirstName: string | null;
    }>,
): MessageReactions {
    const out: MessageReactions = {};

    for (const r of reactions) {
        const type = r.type === 'custom' ? 'custom' : 'emoji';
        const key = type === 'emoji' && r.emoji
            ? `e:${r.emoji}`
            : type === 'custom' && r.customEmojiId
            ? `c:${r.customEmojiId}`
            : undefined;

        if (!key) {
            continue;
        }

        let rec = out[key];
        if (!rec) {
            rec = out[key] = {
                type,
                emoji: r.emoji ?? undefined,
                customEmojiId: r.customEmojiId ?? undefined,
                by: [],
                count: 0,
            };
        }

        rec.count += 1;

        if (r.userId) {
            rec.by.push({
                id: Number(r.userId),
                username: r.userUsername ?? undefined,
                name: r.userFirstName ?? 'User',
            });
        }

        out[key] = rec;
    }

    return out;
}

export async function addReaction(
    messageId: number,
    reaction: CreateReactionInput,
) {
    const prisma = getPrismaClient();

    await prisma.reaction.create({
        data: {
            messageId,
            type: reaction.type,
            emoji: reaction.type === 'emoji' ? reaction.emoji : undefined,
            customEmojiId: reaction.type === 'custom'
                ? reaction.customEmojiId
                : undefined,
            userId: reaction.by ? BigInt(reaction.by.id) : undefined,
            userUsername: reaction.by?.username,
            userFirstName: reaction.by?.first_name,
        },
    });
}

export async function removeReaction(
    messageId: number,
    reaction: RemoveReactionInput,
) {
    const prisma = getPrismaClient();

    await prisma.reaction.deleteMany({
        where: {
            messageId,
            type: reaction.type,
            emoji: reaction.type === 'emoji' ? reaction.emoji : undefined,
            customEmojiId: reaction.type === 'custom'
                ? reaction.customEmojiId
                : undefined,
            userId: reaction.by ? BigInt(reaction.by.id) : undefined,
        },
    });
}

export async function getReactionsForMessage(messageId: number) {
    const prisma = getPrismaClient();

    return await prisma.reaction.findMany({
        where: {
            messageId,
        },
    });
}

export function toMemoryReactionsFromRecords(
    records: ReactionRecord[],
): MessageReactions {
    const out: MessageReactions = {};

    for (const rec of records) {
        const key = keyOf(rec);
        if (!key) continue;
        out[key] = rec;
    }

    return out;
}
