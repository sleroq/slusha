import { count, eq } from 'drizzle-orm';
import { migrateDb } from '../lib/db/migrate.ts';
import { createDb, DbClient } from '../lib/db/client.ts';
import {
    chatCharacters,
    chatMembers,
    chatMessages,
    chatNotes,
    chatOptOutUsers,
    chats,
    messageReactions,
    messageReactionUsers,
} from '../lib/db/schema.ts';
import { Chat, MessageReactions } from '../lib/memory.ts';

interface LegacyMemory {
    chats: Record<string, Chat>;
}

function toBoolInt(value: boolean | undefined): boolean | null {
    if (value === undefined) return null;
    return value;
}

async function upsertChat(db: DbClient, chatId: number, chat: Chat) {

    await db.insert(chats).values({
        id: chatId,
        info: JSON.stringify(chat.info),
        lastUse: chat.lastUse,
        lastNotes: chat.lastNotes,
        lastMemory: chat.lastMemory,
        memory: chat.memory ?? null,
        chatModel: chat.chatModel ?? null,
        messagesToPass: chat.messagesToPass ?? null,
        randomReplyProbability: chat.randomReplyProbability ?? null,
        hateMode: toBoolInt(chat.hateMode),
        locale: chat.locale ?? null,
    }).onConflictDoUpdate({
        target: [chats.id],
        set: {
            info: JSON.stringify(chat.info),
            lastUse: chat.lastUse,
            lastNotes: chat.lastNotes,
            lastMemory: chat.lastMemory,
            memory: chat.memory ?? null,
            chatModel: chat.chatModel ?? null,
            messagesToPass: chat.messagesToPass ?? null,
            randomReplyProbability: chat.randomReplyProbability ?? null,
            hateMode: toBoolInt(chat.hateMode),
            locale: chat.locale ?? null,
        },
    });

    await db.delete(chatNotes).where(eq(chatNotes.chatId, chatId));
    if (chat.notes.length > 0) {
        await db.insert(chatNotes).values(chat.notes.map((note, index) => ({
            chatId,
            noteIndex: index,
            text: note,
        })));
    }

    await db.delete(chatMembers).where(eq(chatMembers.chatId, chatId));
    if (chat.members.length > 0) {
        await db.insert(chatMembers).values(chat.members.map((member) => ({
            chatId,
            userId: member.id,
            username: member.username ?? null,
            firstName: member.first_name,
            description: member.description,
            info: JSON.stringify(member.info),
            lastUse: member.lastUse,
        })));
    }

    await db.delete(chatOptOutUsers).where(eq(chatOptOutUsers.chatId, chatId));
    if (chat.optOutUsers.length > 0) {
        await db.insert(chatOptOutUsers).values(chat.optOutUsers.map((user) => ({
            chatId,
            userId: user.id,
            username: user.username ?? null,
            firstName: user.first_name,
        })));
    }

    await db.delete(messageReactionUsers).where(eq(messageReactionUsers.chatId, chatId));
    await db.delete(messageReactions).where(eq(messageReactions.chatId, chatId));
    await db.delete(chatMessages).where(eq(chatMessages.chatId, chatId));

    if (chat.history.length > 0) {
        await db.insert(chatMessages).values(chat.history.map((message) => ({
            chatId,
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
        })));
    }

    for (const message of chat.history) {
        const reactions = message.reactions as MessageReactions | undefined;
        if (!reactions) continue;

        for (const [key, reaction] of Object.entries(reactions)) {
            await db.insert(messageReactions).values({
                chatId,
                messageId: message.id,
                reactionKey: key,
                type: reaction.type,
                emoji: reaction.emoji ?? null,
                customEmojiId: reaction.customEmojiId ?? null,
                count: reaction.count,
            }).onConflictDoUpdate({
                target: [
                    messageReactions.chatId,
                    messageReactions.messageId,
                    messageReactions.reactionKey,
                ],
                set: {
                    type: reaction.type,
                    emoji: reaction.emoji ?? null,
                    customEmojiId: reaction.customEmojiId ?? null,
                    count: reaction.count,
                },
            });

            for (const user of reaction.by) {
                await db.insert(messageReactionUsers).values({
                    chatId,
                    messageId: message.id,
                    reactionKey: key,
                    userId: user.id,
                    username: user.username ?? null,
                    name: user.name,
                }).onConflictDoUpdate({
                    target: [
                        messageReactionUsers.chatId,
                        messageReactionUsers.messageId,
                        messageReactionUsers.reactionKey,
                        messageReactionUsers.userId,
                    ],
                    set: {
                        username: user.username ?? null,
                        name: user.name,
                    },
                });
            }
        }
    }

    await db.delete(chatCharacters).where(eq(chatCharacters.chatId, chatId));
    if (chat.character) {
        await db.insert(chatCharacters).values({
            chatId,
            payload: JSON.stringify(chat.character),
            names: JSON.stringify(chat.character.names),
        }).onConflictDoUpdate({
            target: [chatCharacters.chatId],
            set: {
                payload: JSON.stringify(chat.character),
                names: JSON.stringify(chat.character.names),
            },
        });
    }
}

async function main() {
    await migrateDb();
    const { db } = createDb();

    const raw = await Deno.readTextFile('memory.json');
    const legacy = JSON.parse(raw) as LegacyMemory;

    const entries = Object.entries(legacy.chats);
    for (const [chatIdRaw, chat] of entries) {
        const chatId = Number(chatIdRaw);
        if (!Number.isFinite(chatId)) {
            continue;
        }
        await upsertChat(db, chatId, chat);
    }

    const [stats] = await db.select({ total: count() }).from(chats);

    console.log(
        `Imported ${entries.length} chats from memory.json to sqlite. Total chats in DB: ${stats?.total ?? 0}`,
    );
}

if (import.meta.main) {
    main();
}
