import { and, asc, desc, eq, gt, lt, lte, or, sql } from 'drizzle-orm';
import { GrammyError, type Api } from 'grammy';
import type { Message, Update } from 'grammy/types';
import { z } from 'zod';
import {
    UnsupportedImageModelError,
    type AgentActions,
    type AgentEvent,
    type AgentKey,
    type AgentSessions,
} from '../agent';
import { characterInstructions, type Characters } from '../characters';
import type { Db } from '../db/client';
import { chatMembers, chats, conversations, events, optOuts, users } from '../db/schema';
import type { Settings } from '../settings';
import { imageFile } from '../telegram/messages';
import { callbackChatId, createCharacterHandler } from '../telegram/character';
import { createTelegramDelivery, PermanentTelegramError } from '../telegram/delivery';
import type { Budgets } from './budget';
import { shouldReply } from './reply-policy';
const groupReplyAgeMs = 15 * 60 * 1000;

class ImageUnavailableError extends Error {}

type Event = typeof events.$inferSelect;
const storedMessage = z.object({
    message_id: z.number(),
    text: z.string().optional(),
    caption: z.string().optional(),
    photo: z.array(z.object({ file_id: z.string() })).optional(),
    document: z.object({ file_id: z.string(), mime_type: z.string().optional() }).optional(),
    from: z.object({ first_name: z.string() }).optional(),
    sender_chat: z.object({ title: z.string().optional() }).optional(),
    reply_to_message: z.object({ message_id: z.number() }).optional(),
});
const storedEdit = z.object({ before: z.string(), message: storedMessage });
const storedReaction = z.object({
    message_id: z.number(),
    old_reaction: z.array(z.unknown()),
    new_reaction: z.array(z.unknown()),
});
const reactionEmoji = z.enum([
    '❤',
    '👍',
    '👎',
    '🔥',
    '🥰',
    '😁',
    '🤔',
    '🤯',
    '😢',
    '🎉',
    '🤮',
    '💩',
    '🤡',
    '🥱',
    '🐳',
    '❤‍🔥',
    '💯',
    '🏆',
    '💔',
    '🍓',
    '💋',
    '🖕',
    '😴',
    '😭',
    '🤓',
    '😨',
    '🫡',
    '💅',
    '💊',
    '😎',
    '😡',
]);
type Options = {
    db: Db;
    api: Api;
    botId: number;
    botUsername: string;
    botToken: string;
    telegramApiRoot?: string;
    settings: Settings;
    sessions: AgentSessions;
    budgets: Budgets;
    characters?: Characters;
    imageModels: ReadonlySet<string>;
    resetFiles(chatId: number): Promise<void>;
    adminIds: readonly number[];
    webAppUrl?: string;
    groupReplyAgeMs?: number;
};

function messageText(message: { text?: string; caption?: string }) {
    return message.text ?? message.caption ?? '';
}

function ref(messageId: number) {
    return `m${messageId}`;
}

function budgetBar(remaining: number | null) {
    if (remaining === null) return 'not configured';
    const filled = Math.round(remaining / 10);
    return `${'▰'.repeat(filled)}${'▱'.repeat(10 - filled)} ${Math.round(remaining)}%`;
}

function isCommand(message: { text?: string; caption?: string }) {
    return /^\/[a-z_]+(?:@\w+)?(?:\s|$)/i.test(messageText(message));
}

function command(message: Message) {
    return messageText(message).split(/\s+/, 1)[0]?.split('@', 1)[0]?.toLowerCase();
}

function format(event: Event) {
    if (event.kind === 'reaction') {
        const reaction = storedReaction.parse(event.payload);
        return `Reaction changed on ${ref(reaction.message_id)}: ${JSON.stringify(reaction.old_reaction)} -> ${JSON.stringify(reaction.new_reaction)}`;
    }
    if (event.kind === 'edit') {
        const payload = storedEdit.parse(event.payload);
        const author = payload.message.from?.first_name ?? 'Unknown';
        return `Message ${ref(payload.message.message_id)} edited by ${author}: ${payload.before ?? ''} -> ${messageText(payload.message)}`;
    }
    const message = storedMessage.parse(event.payload);
    const author = message.from?.first_name ?? message.sender_chat?.title ?? 'Unknown';
    let reply = '';
    if (message.reply_to_message) reply = ` (reply to ${ref(message.reply_to_message.message_id)})`;
    let text = messageText(message);
    if (!text && imageFile(message)) text = '[image]';
    return `[${ref(message.message_id)}] ${author}${reply}: ${text}`;
}

const hiddenEditedMessage = sql`exists (
    select 1 from events as original
    where original.chat_id = ${events.chatId} and original.topic_id = ${events.topicId}
      and original.message_id = ${events.messageId} and original.kind = 'message'
      and original.opted_out and not original.released
)`;
const visible = and(
    or(eq(events.optedOut, false), eq(events.released, true)),
    or(sql`${events.kind} <> 'edit'`, sql`not ${hiddenEditedMessage}`),
);
const eligibleAtRotation = or(
    visible,
    and(
        eq(events.optedOut, true),
        sql`${events.userId} is not null and not exists (select 1 from opt_outs where chat_id = ${events.chatId} and user_id = ${events.userId})`,
    ),
);

async function savedEvent(db: Db, updateId: number) {
    const rows = await db.select().from(events).where(eq(events.updateId, updateId)).limit(1);
    return rows[0];
}

async function optedOut(db: Db, chatId: number, userId: number) {
    const rows = await db
        .select()
        .from(optOuts)
        .where(and(eq(optOuts.chatId, chatId), eq(optOuts.userId, userId)))
        .limit(1);
    return rows.length > 0;
}

export function createAgentActions(
    options: Pick<Options, 'db' | 'api'> & {
        shell(key: AgentKey, command: string): Promise<string>;
    },
): AgentActions {
    const { db, api } = options;
    const delivery = createTelegramDelivery(db, api);

    async function target(key: AgentKey, targetRef: string) {
        const match = /^m(\d+)$/.exec(targetRef);
        if (!match) throw new Error('Invalid message reference');
        const messageId = Number(match[1]);
        const rows = await db
            .select()
            .from(events)
            .where(
                and(
                    eq(events.chatId, key.chatId),
                    eq(events.topicId, key.topicId),
                    eq(events.messageId, messageId),
                    visible,
                ),
            )
            .limit(1);
        if (!rows.length) throw new Error('Message is not available in this conversation');
        return messageId;
    }

    return {
        async reply(key, input) {
            const messageId = await target(key, input.targetRef);
            const options: Parameters<Api['sendMessage']>[2] = {
                reply_parameters: { message_id: messageId },
            };
            if (key.topicId) options.message_thread_id = key.topicId;
            const sent = await delivery.send(key.chatId, input.text, options);
            await db.insert(events).values({
                chatId: key.chatId,
                topicId: key.topicId,
                messageId: sent.message_id,
                userId: sent.from?.id,
                kind: 'bot_message',
                payload: sent,
                occurredAt: new Date(sent.date * 1000),
                optedOut: false,
            });
            return `Sent as ${ref(sent.message_id)}`;
        },
        async react(key, input) {
            const messageId = await target(key, input.targetRef);
            await api.setMessageReaction(key.chatId, messageId, [
                { type: 'emoji', emoji: reactionEmoji.parse(input.emoji) },
            ]);
            return 'Reaction sent';
        },
        shell(key, input) {
            return options.shell(key, input.command);
        },
        async history(key, input) {
            const query = `%${input.query.replace(/[\\%_]/g, '\\$&')}%`;
            const rows = await db
                .select()
                .from(events)
                .where(
                    and(
                        eq(events.chatId, key.chatId),
                        eq(events.topicId, key.topicId),
                        visible,
                        sql`${events.payload}::text ILIKE ${query}`,
                    ),
                )
                .orderBy(desc(events.id))
                .limit(100);
            return rows
                .filter((row) => format(row).toLowerCase().includes(input.query.toLowerCase()))
                .reverse()
                .map(format)
                .join('\n');
        },
    };
}

export function createConversationHandler(options: Options) {
    const { db, api, settings, sessions } = options;
    const delivery = createTelegramDelivery(db, api);
    const characterHandler = createCharacterHandler(options);

    async function rememberMessage(updateId: number, message: Message, kind: 'message' | 'edit') {
        const prior = await savedEvent(db, updateId);
        if (prior) return prior;

        const chatId = message.chat.id;
        const userId = message.from?.id;
        const topicId = message.message_thread_id ?? 0;
        const excluded = userId !== undefined && (await optedOut(db, chatId, userId));
        let payload: unknown = message;
        if (kind === 'edit') {
            const [previous] = await db
                .select()
                .from(events)
                .where(
                    and(
                        eq(events.chatId, chatId),
                        eq(events.topicId, topicId),
                        eq(events.messageId, message.message_id),
                        or(eq(events.kind, 'message'), eq(events.kind, 'edit')),
                        visible,
                    ),
                )
                .orderBy(desc(events.id))
                .limit(1);
            let before = '';
            if (previous?.kind === 'message')
                before = messageText(storedMessage.parse(previous.payload));
            if (previous?.kind === 'edit')
                before = messageText(storedEdit.parse(previous.payload).message);
            payload = { before, message };
        }

        await db
            .insert(chats)
            .values({ id: chatId, type: message.chat.type, info: message.chat })
            .onConflictDoUpdate({
                target: chats.id,
                set: { type: message.chat.type, info: message.chat },
            });
        if (message.from) {
            await db
                .insert(users)
                .values({
                    id: message.from.id,
                    username: message.from.username,
                    firstName: message.from.first_name,
                    info: message.from,
                    lastSeen: new Date(),
                })
                .onConflictDoUpdate({
                    target: users.id,
                    set: {
                        username: message.from.username,
                        firstName: message.from.first_name,
                        info: message.from,
                        lastSeen: new Date(),
                    },
                });
            await db
                .insert(chatMembers)
                .values({ chatId, userId: message.from.id, lastSeen: new Date() })
                .onConflictDoUpdate({
                    target: [chatMembers.chatId, chatMembers.userId],
                    set: { lastSeen: new Date() },
                });
        }

        const inserted = await db
            .insert(events)
            .values({
                updateId,
                chatId,
                topicId,
                messageId: message.message_id,
                userId,
                kind,
                payload,
                occurredAt: new Date(message.date * 1000),
                optedOut: excluded,
            })
            .onConflictDoNothing()
            .returning();
        return inserted[0] ?? (await savedEvent(db, updateId));
    }

    async function admin(message: Message) {
        const userId = message.from?.id;
        if (!userId) return false;
        if (message.chat.type === 'private' || options.adminIds.includes(userId)) return true;
        const member = await delivery.getChatMember(message.chat.id, userId);
        return member.status === 'creator' || member.status === 'administrator';
    }

    async function cursor(key: AgentKey) {
        await db
            .insert(conversations)
            .values({ ...key, sessionId: `${key.chatId}_${key.topicId}` })
            .onConflictDoNothing();
        const rows = await db
            .select()
            .from(conversations)
            .where(
                and(eq(conversations.chatId, key.chatId), eq(conversations.topicId, key.topicId)),
            )
            .limit(1);
        return rows[0]!;
    }

    async function redactHidden(key: AgentKey, requestId: string) {
        const hidden = await db
            .select({ id: events.id })
            .from(events)
            .where(
                and(
                    eq(events.chatId, key.chatId),
                    eq(events.topicId, key.topicId),
                    or(
                        and(eq(events.optedOut, true), eq(events.released, false)),
                        and(eq(events.kind, 'edit'), hiddenEditedMessage),
                    ),
                ),
            );
        if (hidden.length)
            await sessions.redact(
                key,
                hidden.map((row) => row.id),
                requestId,
            );
    }

    async function image(event: Event, model: string) {
        if (event.kind !== 'message' || !options.imageModels.has(model)) return [];
        const message = storedMessage.parse(event.payload);
        const attachment = imageFile(message);
        if (!attachment) return [];
        let file: Awaited<ReturnType<Api['getFile']>>;
        try {
            file = await api.getFile(attachment.fileId);
        } catch (error) {
            if (error instanceof GrammyError && error.error_code >= 400 && error.error_code < 500)
                throw new ImageUnavailableError();
            throw error;
        }
        if (!file.file_path || (file.file_size && file.file_size > 20 * 1024 * 1024))
            throw new ImageUnavailableError();
        const response = await fetch(
            `${options.telegramApiRoot ?? 'https://api.telegram.org'}/file/bot${options.botToken}/${file.file_path}`,
        );
        if (response.status >= 400 && response.status < 500) throw new ImageUnavailableError();
        if (!response.ok) throw new Error('Could not download Telegram image');
        const bytes = await response.arrayBuffer();
        if (bytes.byteLength > 20 * 1024 * 1024) throw new ImageUnavailableError();
        return [{ data: Buffer.from(bytes).toString('base64'), mimeType: attachment.mimeType }];
    }

    async function handleCommand(message: Message, event: Event) {
        const key = { chatId: event.chatId, topicId: event.topicId };
        const name = command(message);
        const userId = message.from?.id;
        if (!userId) return;

        if (name === '/optout') {
            await db.transaction(async (tx) => {
                await tx
                    .insert(optOuts)
                    .values({ chatId: key.chatId, userId })
                    .onConflictDoNothing();
                await tx
                    .update(events)
                    .set({ released: false })
                    .where(
                        and(
                            eq(events.chatId, key.chatId),
                            eq(events.userId, userId),
                            eq(events.optedOut, true),
                        ),
                    );
            });
            const affected = await db
                .select({ id: events.id, topicId: events.topicId })
                .from(events)
                .where(
                    and(
                        eq(events.chatId, key.chatId),
                        eq(events.userId, userId),
                        or(
                            eq(events.optedOut, true),
                            and(eq(events.kind, 'edit'), hiddenEditedMessage),
                        ),
                    ),
                );
            const topics = new Map<number, number[]>();
            for (const row of affected) {
                const ids = topics.get(row.topicId) ?? [];
                ids.push(row.id);
                topics.set(row.topicId, ids);
            }
            for (const [topicId, ids] of topics) {
                await sessions.redact({ chatId: key.chatId, topicId }, ids, String(event.updateId));
            }
            await delivery.send(key.chatId, 'You are opted out in this chat.');
        } else if (name === '/optin') {
            await db
                .delete(optOuts)
                .where(and(eq(optOuts.chatId, key.chatId), eq(optOuts.userId, userId)));
            await delivery.send(key.chatId, 'You are opted in in this chat.');
        } else if (name === '/budget') {
            const remaining = await options.budgets.status(key.chatId, userId);
            await delivery.send(
                key.chatId,
                `Weekly budget remaining:\nYou: ${budgetBar(remaining.user)}\nChat: ${budgetBar(remaining.chat)}`,
            );
        } else if (name === '/character') {
            const args = messageText(message).trim().split(/\s+/).slice(1);
            if (!options.characters) {
                await delivery.send(key.chatId, 'Character selection is unavailable.');
            } else if (args[0] === 'search' && args.length > 1) {
                let text: string;
                try {
                    const results = await options.characters.search(args.slice(1).join(' '));
                    text =
                        results
                            .map((item) => `${item.id}: ${item.name}`)
                            .join('\n')
                            .slice(0, 4000) || 'No characters found.';
                } catch {
                    text = 'Could not search Chub.ai.';
                }
                await delivery.send(key.chatId, text);
            } else if (args[0] === 'set' || args[0] === 'default') {
                if (!(await admin(message))) {
                    await delivery.send(key.chatId, 'Only chat administrators can do this.');
                    return;
                }
                if (args[0] === 'default') {
                    await options.characters.clear(key.chatId);
                    await delivery.send(key.chatId, 'The default character is active.');
                } else {
                    const id = Number(args[1]);
                    if (!Number.isSafeInteger(id) || id <= 0) {
                        await delivery.send(key.chatId, 'Use /character set <id>.');
                        return;
                    }
                    let text: string;
                    try {
                        const selected = await options.characters.select(key.chatId, id, userId);
                        text = `Character selected: ${selected.name}`;
                    } catch {
                        text = 'Could not select that character.';
                    }
                    await delivery.send(key.chatId, text);
                }
            } else {
                await characterHandler.current(key.chatId);
            }
        } else if (name === '/language' || name === '/hatemode' || name === '/shell') {
            if (!(await admin(message))) {
                await delivery.send(key.chatId, 'Only chat administrators can do this.');
                return;
            }
            const target = { scope: 'chat', chatId: key.chatId } as const;
            if (name === '/language') {
                const locale = messageText(message).trim().split(/\s+/)[1];
                if (!locale || !['ru', 'en', 'uk', 'pt', 'hi', 'id'].includes(locale)) {
                    await delivery.send(key.chatId, 'Use /language ru, en, uk, pt, hi, or id.');
                    return;
                }
                await settings.setOption(target, 'locale', locale);
                await delivery.send(key.chatId, `Language: ${locale}`);
            } else if (name === '/shell') {
                const mode = messageText(message).trim().split(/\s+/)[1];
                if (mode !== 'on' && mode !== 'off') {
                    await delivery.send(key.chatId, 'Use /shell on or /shell off.');
                    return;
                }
                await settings.setOption(target, 'shellEnabled', mode === 'on');
                await delivery.send(key.chatId, `Shell ${mode}.`);
            } else {
                const current = await settings.resolve(key.chatId, userId);
                await settings.setOption(target, 'hateMode', !current.hateMode);
                if (current.hateMode) await delivery.send(key.chatId, 'Hatemode off.');
                else await delivery.send(key.chatId, 'Hatemode on.');
            }
        } else if (name === '/forget' || name === '/lobotomy') {
            if (!(await admin(message))) {
                await delivery.send(key.chatId, 'Only chat administrators can do this.');
                return;
            }
            if (name === '/lobotomy') {
                if (messageText(message).trim().split(/\s+/)[1] !== 'confirm') {
                    await delivery.send(
                        key.chatId,
                        'Send /lobotomy confirm to reset the session and delete the chat workspace.',
                    );
                    return;
                }
                try {
                    await options.resetFiles(key.chatId);
                } catch {
                    await delivery.send(
                        key.chatId,
                        'Could not delete the chat workspace; the session was not reset.',
                    );
                    return;
                }
            }
            const current = await cursor(key);
            await db
                .update(conversations)
                .set({ pendingReset: event.id })
                .where(
                    and(
                        eq(conversations.chatId, key.chatId),
                        eq(conversations.topicId, key.topicId),
                    ),
                );
            await sessions.reset(key);
            await sessions.mark(
                key,
                { generation: current.generation + 1, eventId: event.id },
                `reset:${crypto.randomUUID()}`,
            );
            await db
                .update(conversations)
                .set({
                    contextEventId: event.id,
                    generation: current.generation + 1,
                    pendingRotation: false,
                    pendingReset: null,
                })
                .where(
                    and(
                        eq(conversations.chatId, key.chatId),
                        eq(conversations.topicId, key.topicId),
                    ),
                );
            await delivery.send(key.chatId, 'Session reset.');
        } else if (name === '/start') {
            const { startMessage } = await settings.resolve(key.chatId, userId);
            if (options.webAppUrl && message.chat.type === 'private') {
                await delivery.send(key.chatId, startMessage, {
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: 'Настройки', web_app: { url: options.webAppUrl } }],
                        ],
                    },
                });
            } else {
                await delivery.send(key.chatId, startMessage);
            }
        }
    }

    async function isComment(message: Message) {
        if (message.is_automatic_forward || message.reply_to_message?.is_automatic_forward)
            return true;
        if (!message.message_thread_id) return false;
        const rows = await db
            .select({ payload: events.payload })
            .from(events)
            .where(
                and(
                    eq(events.chatId, message.chat.id),
                    eq(events.messageId, message.message_thread_id),
                    eq(events.kind, 'message'),
                ),
            )
            .limit(1);
        return z.object({ is_automatic_forward: z.literal(true) }).safeParse(rows[0]?.payload)
            .success;
    }

    async function handleMessage(
        updateId: number,
        message: Message,
        kind: 'message' | 'edit',
        deferReply = false,
    ) {
        const event = await rememberMessage(updateId, message, kind);
        if (!event) throw new Error('Could not persist Telegram message');
        if (kind === 'edit') return;
        if (isCommand(message)) return handleCommand(message, event);

        if (event.optedOut || !message.from || message.from.is_bot || deferReply) return;
        const text = messageText(message);
        if (!text && !imageFile(message)) return;
        if (
            message.chat.type !== 'private' &&
            Date.now() - message.date * 1000 > (options.groupReplyAgeMs ?? groupReplyAgeMs)
        )
            return;

        const key = { chatId: event.chatId, topicId: event.topicId };
        const effective = await settings.resolve(key.chatId, message.from.id);
        const character = await options.characters?.get(key.chatId);
        const replySettings = { ...effective, names: [...effective.names] };
        if (character) replySettings.names.push(character.name, ...(character.names ?? []));
        if (
            !shouldReply(
                message,
                { id: options.botId, username: options.botUsername },
                replySettings,
            )
        )
            return;
        if (!(await options.budgets.permits(key.chatId, message.from.id))) return;
        if (!(await delivery.canSend(key.chatId, key.topicId))) return;
        const { model } = effective;
        if (imageFile(message) && !options.imageModels.has(model)) {
            await delivery.send(
                key.chatId,
                'The selected model cannot process images. Choose an image-capable model in settings.',
            );
            return;
        }
        let current = await cursor(key);
        if (current.pendingReset !== null) {
            await sessions.reset(key);
            await sessions.mark(
                key,
                { generation: current.generation + 1, eventId: current.pendingReset },
                `reset:${crypto.randomUUID()}`,
            );
            await db
                .update(conversations)
                .set({
                    generation: current.generation + 1,
                    contextEventId: current.pendingReset,
                    pendingRotation: false,
                    pendingReset: null,
                })
                .where(
                    and(
                        eq(conversations.chatId, key.chatId),
                        eq(conversations.topicId, key.topicId),
                    ),
                );
            current = await cursor(key);
        }
        await redactHidden(key, `reconcile:${updateId}`);
        const checkpoint = await sessions.checkpoint(key);
        const missingSession =
            !checkpoint && (current.contextEventId !== 0 || current.generation !== 0);
        if (
            current.pendingRotation ||
            missingSession ||
            (checkpoint && checkpoint.generation !== current.generation) ||
            (await sessions.shouldRotate(key, model))
        ) {
            const candidates = await db
                .select()
                .from(events)
                .where(
                    and(
                        eq(events.chatId, key.chatId),
                        eq(events.topicId, key.topicId),
                        eligibleAtRotation,
                        lt(events.id, event.id),
                    ),
                )
                .orderBy(desc(events.id))
                .limit(200);
            const seed: Event[] = [];
            const seedBudget = sessions.seedBudget(model);
            let seedCost = 0;
            for (const row of candidates) {
                if (row.kind === 'message' && isCommand(storedMessage.parse(row.payload))) continue;
                let cost = Buffer.byteLength(format(row), 'utf8');
                if (row.kind === 'message' && imageFile(storedMessage.parse(row.payload)))
                    cost += 16_384;
                if (seedCost + cost > seedBudget) continue;
                seed.push(row);
                seedCost += cost;
                if (seed.length === 20) break;
            }
            seed.reverse();
            if (
                !options.imageModels.has(model) &&
                seed.some(
                    (row) => row.kind === 'message' && imageFile(storedMessage.parse(row.payload)),
                )
            ) {
                await delivery.send(
                    key.chatId,
                    'This conversation contains images the selected model cannot process. Choose an image-capable model or use /forget.',
                );
                return;
            }
            await db
                .update(conversations)
                .set({ pendingRotation: true })
                .where(
                    and(
                        eq(conversations.chatId, key.chatId),
                        eq(conversations.topicId, key.topicId),
                    ),
                );
            await sessions.reset(key);
            const namespace = `seed:${crypto.randomUUID()}`;
            for (const row of seed) {
                const contextEvent: AgentEvent = {
                    id: row.id,
                    generation: current.generation + 1,
                    namespace,
                    text: format(row),
                    system: row.kind === 'edit' || row.kind === 'reaction',
                };
                try {
                    contextEvent.images = await image(row, model);
                } catch (error) {
                    if (!(error instanceof ImageUnavailableError)) throw error;
                    contextEvent.text += '\n[Image is no longer available from Telegram.]';
                }
                await sessions.append(key, contextEvent);
            }
            await sessions.mark(
                key,
                { generation: current.generation + 1, eventId: event.id - 1 },
                namespace,
            );
            await db.transaction(async (tx) => {
                await tx
                    .update(events)
                    .set({ released: true })
                    .where(
                        and(
                            eq(events.chatId, key.chatId),
                            eq(events.topicId, key.topicId),
                            eq(events.optedOut, true),
                            eligibleAtRotation,
                        ),
                    );
                await tx
                    .update(conversations)
                    .set({
                        generation: current.generation + 1,
                        pendingRotation: false,
                        contextEventId: event.id - 1,
                    })
                    .where(
                        and(
                            eq(conversations.chatId, key.chatId),
                            eq(conversations.topicId, key.topicId),
                        ),
                    );
            });
            current = await cursor(key);
        }
        const reconciled = await sessions.checkpoint(key);
        const replayFrom = reconciled?.generation === current.generation ? reconciled.eventId : 0;
        const prior = await db
            .select()
            .from(events)
            .where(
                and(
                    eq(events.chatId, key.chatId),
                    eq(events.topicId, key.topicId),
                    visible,
                    gt(events.id, Math.min(replayFrom, current.contextEventId)),
                    lte(events.id, event.id),
                ),
            )
            .orderBy(asc(events.id));
        if (
            !options.imageModels.has(model) &&
            prior.some(
                (row) => row.kind === 'message' && imageFile(storedMessage.parse(row.payload)),
            )
        ) {
            await delivery.send(
                key.chatId,
                'This conversation contains images the selected model cannot process. Choose an image-capable model or use /forget.',
            );
            return;
        }
        for (const row of prior) {
            if (row.id === event.id) break;
            if (row.kind === 'bot_message' && row.id > current.contextEventId) continue;
            if (row.id <= replayFrom) continue;
            if (row.kind === 'message' && isCommand(storedMessage.parse(row.payload))) continue;
            const contextEvent: AgentEvent = {
                id: row.id,
                generation: current.generation,
                namespace: `generation:${current.generation}`,
                text: format(row),
                system: row.kind === 'edit' || row.kind === 'reaction',
            };
            try {
                contextEvent.images = await image(row, model);
            } catch (error) {
                if (!(error instanceof ImageUnavailableError)) throw error;
                contextEvent.text += '\n[Image is no longer available from Telegram.]';
            }
            await sessions.append(key, contextEvent);
        }
        try {
            let personality = effective['ai.prompt'];
            if (character) personality = characterInstructions(character);
            let contextPrompt = effective['ai.groupChatPromptAddition'];
            if (message.chat.type === 'private')
                contextPrompt = effective['ai.privateChatPromptAddition'];
            if (await isComment(message))
                contextPrompt += `\n${effective['ai.commentsPromptAddition']}`;
            let hatePrompt = '';
            if (effective.hateMode) hatePrompt = effective['ai.hateModePrompt'];
            const instructions = [
                effective['ai.prePrompt'],
                personality,
                contextPrompt,
                hatePrompt,
                effective['ai.chatActionsToolDescription'],
                effective['ai.finalPrompt'],
                `The preferred chat language is ${effective.locale}.`,
            ]
                .filter(Boolean)
                .join('\n\n');
            const images = await image(event, model);
            await options.budgets.reconcile(key, await sessions.usage(key));
            await options.budgets.start(key, event.id);
            const result = await sessions.run(key, {
                requestId: String(updateId),
                eventId: event.id,
                generation: current.generation,
                model,
                text: format(event),
                images,
                instructions,
                shellEnabled: effective.shellEnabled,
            });
            const [reply] = await db
                .select({ id: events.id })
                .from(events)
                .where(
                    and(
                        eq(events.chatId, key.chatId),
                        eq(events.topicId, key.topicId),
                        eq(events.kind, 'bot_message'),
                        gt(events.id, event.id),
                    ),
                )
                .orderBy(desc(events.id))
                .limit(1);
            if (reply)
                await sessions.mark(
                    key,
                    { generation: current.generation, eventId: reply.id },
                    `reply:${current.generation}:${event.id}`,
                );
            await options.budgets.record(key, message.from.id, event.id, result.cumulativeUsage);
            if (result.settlement.status !== 'done') {
                await delivery.send(key.chatId, 'Could not generate a reply. Please try again.');
            }
        } catch (error) {
            if (error instanceof UnsupportedImageModelError) {
                await options.budgets.abandon(key);
                await delivery.send(
                    key.chatId,
                    'This session contains images the selected model cannot process. Choose an image-capable model or use /forget.',
                );
            } else if (error instanceof ImageUnavailableError) {
                await options.budgets.abandon(key);
                await delivery.send(
                    key.chatId,
                    'This image is no longer available or exceeds the 20 MB limit.',
                );
            } else {
                throw error;
            }
        }
    }

    const tails = new Map<number, Promise<unknown>>();
    async function process(update: Update, context: { deferReply: boolean }) {
        if (update.inline_query) return characterHandler.inline(update.inline_query);
        if (update.callback_query) return characterHandler.callback(update.callback_query);
        if (update.message)
            return handleMessage(update.update_id, update.message, 'message', context.deferReply);
        if (update.edited_message)
            return handleMessage(update.update_id, update.edited_message, 'edit');
        if (update.message_reaction) {
            if (await savedEvent(db, update.update_id)) return;
            const reaction = update.message_reaction;
            const rows = await db
                .select()
                .from(events)
                .where(
                    and(
                        eq(events.chatId, reaction.chat.id),
                        eq(events.messageId, reaction.message_id),
                    ),
                )
                .orderBy(asc(events.id))
                .limit(1);
            const excluded = reaction.user
                ? await optedOut(db, reaction.chat.id, reaction.user.id)
                : false;
            await db
                .insert(events)
                .values({
                    updateId: update.update_id,
                    chatId: reaction.chat.id,
                    topicId: rows[0]?.topicId ?? 0,
                    messageId: reaction.message_id,
                    userId: reaction.user?.id,
                    kind: 'reaction',
                    payload: reaction,
                    occurredAt: new Date(reaction.date * 1000),
                    optedOut: excluded,
                })
                .onConflictDoNothing();
        }
    }
    return async function processUpdate(
        update: Update,
        context: { deferReply: boolean } = { deferReply: false },
    ) {
        const chatId =
            callbackChatId(update.callback_query?.data) ??
            update.message?.chat.id ??
            update.edited_message?.chat.id ??
            update.message_reaction?.chat.id;
        if (chatId === undefined) return process(update, context);
        const result = (tails.get(chatId) ?? Promise.resolve()).then(() =>
            process(update, context),
        );
        const tail = result.catch(() => {});
        tails.set(chatId, tail);
        try {
            await result;
        } catch (error) {
            if (
                !(error instanceof PermanentTelegramError) ||
                !(await savedEvent(db, update.update_id))
            )
                throw error;
            console.error('Permanent Telegram request failure', error.telegramError);
        } finally {
            if (tails.get(chatId) === tail) tails.delete(chatId);
        }
    };
}
