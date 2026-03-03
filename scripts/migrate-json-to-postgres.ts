import { Chat as TgChat, Message as TgMessage, User } from 'grammy_types';

import logger from '../lib/logger.ts';
import { getPrismaClient } from '../lib/db/client.ts';

type JsonChatMessage = {
    id: number;
    text: string;
    replyTo?: {
        id: number;
        text: string;
        info: unknown;
        isMyself: boolean;
    };
    isMyself: boolean;
    info: unknown;
    reactions?: Record<
        string,
        {
            type: 'emoji' | 'custom';
            emoji?: string;
            customEmojiId?: string;
            by: Array<{ id: number; username?: string; name: string }>;
            count: number;
        }
    >;
};

type JsonChat = {
    notes: string[];
    lastNotes: number;
    lastMemory: number;
    history: JsonChatMessage[];
    memory?: string;
    lastUse: number;
    info: TgChat;
    chatModel?: string;
    character?: unknown;
    optOutUsers: Array<{ id: number; username?: string; first_name: string }>;
    members: Array<{
        id: number;
        username?: string;
        first_name: string;
        description: string;
        info: User;
        lastUse: number;
    }>;
    messagesToPass?: number;
    randomReplyProbability?: number;
    hateMode?: boolean;
    locale?: string;
};

type JsonMemory = {
    chats: Record<string, JsonChat>;
};

function safeParseJson(input: string): unknown {
    try {
        return JSON.parse(input);
    } catch (error) {
        logger.error('Could not parse JSON: ', error);
        return null;
    }
}

function toDateFromUnixOrMillis(v: unknown): Date {
    if (typeof v !== 'number' || Number.isNaN(v)) {
        return new Date();
    }

    if (v > 1_000_000_000_000) {
        return new Date(v);
    }

    return new Date(v * 1000);
}

function getSenderInfo(msg: TgMessage):
    | { id: bigint; username?: string; firstName?: string }
    | undefined {
    const from = msg.from;
    if (!from) return undefined;

    return {
        id: BigInt(from.id),
        username: from.username ?? undefined,
        firstName: from.first_name ?? undefined,
    };
}

export async function migrateJsonToPostgres(path = 'memory.json') {
    const prisma = getPrismaClient();

    const raw = await Deno.readTextFile(path);
    const parsed = safeParseJson(raw) as JsonMemory | null;

    if (!parsed || !parsed.chats) {
        throw new Error('Invalid memory.json format');
    }

    const chatEntries = Object.entries(parsed.chats);
    logger.info(`Migrating ${chatEntries.length} chats from ${path}`);

    for (const [chatIdStr, chat] of chatEntries) {
        const chatId = BigInt(chatIdStr);

        await prisma.$transaction(async (tx) => {
            await tx.chat.upsert({
                where: { id: chatId },
                create: {
                    id: chatId,
                    type: chat.info.type,
                    title: (chat.info as any).title ?? undefined,
                    firstName: (chat.info as any).first_name ?? undefined,
                    username: (chat.info as any).username ?? undefined,
                    notes: chat.notes ?? [],
                    lastNotesMessageId: chat.lastNotes ?? 0,
                    lastMemoryMessageId: chat.lastMemory ?? 0,
                    memory: chat.memory ?? undefined,
                    lastUse: toDateFromUnixOrMillis(chat.lastUse),
                    chatModel: chat.chatModel ?? undefined,
                    character: chat.character as any,
                    messagesToPass: chat.messagesToPass ?? undefined,
                    randomReplyProbability: chat.randomReplyProbability ?? undefined,
                    hateMode: chat.hateMode ?? false,
                    locale: chat.locale ?? undefined,
                    telegramInfo: chat.info as any,
                },
                update: {
                    type: chat.info.type,
                    title: (chat.info as any).title ?? undefined,
                    firstName: (chat.info as any).first_name ?? undefined,
                    username: (chat.info as any).username ?? undefined,
                    notes: chat.notes ?? [],
                    lastNotesMessageId: chat.lastNotes ?? 0,
                    lastMemoryMessageId: chat.lastMemory ?? 0,
                    memory: chat.memory ?? undefined,
                    lastUse: toDateFromUnixOrMillis(chat.lastUse),
                    chatModel: chat.chatModel ?? undefined,
                    character: chat.character as any,
                    messagesToPass: chat.messagesToPass ?? undefined,
                    randomReplyProbability: chat.randomReplyProbability ?? undefined,
                    hateMode: chat.hateMode ?? false,
                    locale: chat.locale ?? undefined,
                    telegramInfo: chat.info as any,
                },
            });

            for (const m of chat.members ?? []) {
                await tx.member.upsert({
                    where: {
                        chatId_telegramId: {
                            chatId,
                            telegramId: BigInt(m.id),
                        },
                    },
                    create: {
                        chatId,
                        telegramId: BigInt(m.id),
                        username: m.username ?? undefined,
                        firstName: m.first_name,
                        description: m.description ?? '',
                        lastUse: toDateFromUnixOrMillis(m.lastUse),
                        telegramInfo: m.info as any,
                    },
                    update: {
                        username: m.username ?? undefined,
                        firstName: m.first_name,
                        description: m.description ?? '',
                        lastUse: toDateFromUnixOrMillis(m.lastUse),
                        telegramInfo: m.info as any,
                    },
                });
            }

            for (const u of chat.optOutUsers ?? []) {
                await tx.optOutUser.upsert({
                    where: {
                        chatId_telegramId: {
                            chatId,
                            telegramId: BigInt(u.id),
                        },
                    },
                    create: {
                        chatId,
                        telegramId: BigInt(u.id),
                        username: u.username ?? undefined,
                        firstName: u.first_name,
                    },
                    update: {
                        username: u.username ?? undefined,
                        firstName: u.first_name,
                    },
                });
            }

            for (const msg of chat.history ?? []) {
                const info = msg.info as TgMessage;
                const sender = getSenderInfo(info);

                const created = await tx.message.create({
                    data: {
                        chatId,
                        telegramId: msg.id,
                        text: msg.text ?? '',
                        isMyself: msg.isMyself,
                        senderId: sender?.id,
                        senderUsername: sender?.username,
                        senderFirstName: sender?.firstName,
                        date: toDateFromUnixOrMillis(info.date),
                        caption: (info as any).caption ?? undefined,
                        replyToTelegramId: msg.replyTo?.id,
                        replyToText: msg.replyTo?.text,
                        telegramInfo: info as any,
                    },
                });

                const reactions = msg.reactions ? Object.values(msg.reactions) : [];
                for (const r of reactions) {
                    for (const by of r.by ?? []) {
                        await tx.reaction.create({
                            data: {
                                messageId: created.id,
                                type: r.type,
                                emoji: r.type === 'emoji' ? r.emoji : undefined,
                                customEmojiId: r.type === 'custom'
                                    ? r.customEmojiId
                                    : undefined,
                                userId: BigInt(by.id),
                                userUsername: by.username ?? undefined,
                                userFirstName: by.name,
                            },
                        });
                    }
                }
            }
        });

        logger.info(`Migrated chat ${chatIdStr}`);
    }

    logger.info('Migration complete');
}

if (import.meta.main) {
    const path = Deno.args[0] ?? 'memory.json';
    await migrateJsonToPostgres(path);
}
