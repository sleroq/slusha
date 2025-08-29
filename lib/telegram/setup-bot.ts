import { Bot, Context } from 'grammy';
import logger from '../logger.ts';
import { Config } from '../config.ts';
import { ChatMemory, Memory, ReplyTo } from '../memory.ts';
import { sequentialize } from '@grammyjs/runner';

interface RequestInfo {
    isRandom: boolean;
    userToReply?: string;
    config: Config['ai'];
}

export type SlushaContext = Context & {
    info: RequestInfo;
    memory: Memory;
    m: ChatMemory;
};

function isEmojiReactionType(obj: unknown): obj is { type: 'emoji'; emoji: string } {
    return typeof obj === 'object' && obj !== null &&
        (obj as { type?: unknown }).type === 'emoji' &&
        typeof (obj as { emoji?: unknown }).emoji === 'string';
}

function isCustomReactionType(obj: unknown): obj is { type: 'custom_emoji'; custom_emoji_id: string } {
    return typeof obj === 'object' && obj !== null &&
        (obj as { type?: unknown }).type === 'custom_emoji' &&
        typeof (obj as { custom_emoji_id?: unknown }).custom_emoji_id === 'string';
}

function pickCount(obj: unknown): number | undefined {
    if (typeof obj !== 'object' || obj === null) return undefined;
    const o = obj as { total_count?: unknown; count?: unknown; total?: unknown };
    if (typeof o.total_count === 'number') return o.total_count;
    if (typeof o.count === 'number') return o.count;
    if (typeof o.total === 'number') return o.total;
    return undefined;
}

// TODO: Maybe derive from bot info somehow?
const commands = [
    '/optout',
    '/context',
    '/model',
    '/lobotomy',
    '/random',
    '/summary',
];

const startDate = new Date();

export default async function setupBot(config: Config, memory: Memory) {
    Deno.mkdir('./tmp', { recursive: true });

    const bot = new Bot<SlushaContext>(config.botToken);

    bot.catch((error) =>
        logger.error({
            ...error,
            ctx: { ...error.ctx, m: undefined, memory: undefined },
        })
    );

    // Make sure messages are handled sequentially
    bot.use(sequentialize((ctx) => {
        const chat = ctx.chat?.id.toString();
        const user = ctx.from?.id.toString();
        return [chat, user].filter((con) => con !== undefined);
    }));

    bot.use((ctx, next) => {
        // Init custom context
        ctx.memory = memory;
        if (ctx.chat) {
            ctx.m = new ChatMemory(memory, ctx.chat);
        }
        ctx.info = { isRandom: false, config: config.ai };

        return next();
    });

    // Reaction updates (added/removed/changed by users)
    bot.on('message_reaction', (ctx, next) => {
        try {
            const mr = ctx.update.message_reaction;
            if (!mr) return next();
            const messageId = mr.message_id;
            const chat = ctx.chat;
            if (!chat) return next();

            // grammY exposes ctx.reactions() helper if plugin is present;
            // fall back to raw arrays otherwise
            let emojiAdded: string[] = [];
            let emojiRemoved: string[] = [];
            let customAdded: string[] = [];
            let customRemoved: string[] = [];

            try {
                // @ts-ignore - available when reaction context is present
                const r = ctx.reactions?.();
                if (r) {
                    emojiAdded = r.emojiAdded ?? [];
                    emojiRemoved = r.emojiRemoved ?? [];
                    customAdded = r.customEmojiAdded ?? [];
                    customRemoved = r.customEmojiRemoved ?? [];
                }
            } catch (_) {
                // ignore
            }

            // Fallback parse from raw arrays if available
            if (emojiAdded.length === 0 && mr.new_reaction) {
                for (const r of mr.new_reaction as unknown[]) {
                    if (isEmojiReactionType(r)) emojiAdded.push(r.emoji);
                    else if (isCustomReactionType(r)) customAdded.push(r.custom_emoji_id);
                }
            }
            if (emojiRemoved.length === 0 && mr.old_reaction) {
                for (const r of mr.old_reaction as unknown[]) {
                    if (isEmojiReactionType(r)) emojiRemoved.push(r.emoji);
                    else if (isCustomReactionType(r)) customRemoved.push(r.custom_emoji_id);
                }
            }

            const by = ctx.from ? {
                id: ctx.from.id,
                username: ctx.from.username,
                first_name: ctx.from.first_name,
            } : undefined;

            for (const e of emojiAdded) ctx.m.addEmojiReaction(messageId, e, by);
            for (const e of emojiRemoved) ctx.m.removeEmojiReaction(messageId, e, by);
            for (const c of customAdded) ctx.m.addCustomReaction(messageId, c, by);
            for (const c of customRemoved) ctx.m.removeCustomReaction(messageId, c, by);
        } catch (error) {
            logger.warn('Could not process message_reaction: ', error);
        }

        return next();
    });

    // Channel reaction counts (anonymous) or forwarded channel posts in groups
    bot.on('message_reaction_count', (ctx, next) => {
        try {
            const mrc = ctx.update.message_reaction_count;
            if (!mrc) return next();
            const messageId = mrc.message_id;

            const rawCounts = ((mrc as unknown) as { reactions?: unknown; reaction_counts?: unknown }).reactions
                ?? ((mrc as unknown) as { reactions?: unknown; reaction_counts?: unknown }).reaction_counts
                ?? [];

            const arr = Array.isArray(rawCounts) ? rawCounts : [];
            const counts = arr.map((r: unknown) => {
                const obj = r as { type?: unknown };
                const t = obj.type ?? obj;
                if (isEmojiReactionType(t)) {
                    return { type: 'emoji' as const, emoji: t.emoji, total: pickCount(r) ?? 0 };
                }
                if (isCustomReactionType(t)) {
                    return { type: 'custom' as const, customEmojiId: t.custom_emoji_id, total: pickCount(r) ?? 0 };
                }
                return undefined;
            }).filter((x): x is { type: 'emoji'; emoji: string; total: number } | { type: 'custom'; customEmojiId: string; total: number } => x !== undefined);

            ctx.m.setReactionCounts(messageId, counts);
        } catch (error) {
            logger.warn('Could not process message_reaction_count: ', error);
        }
        return next();
    });

    // TODO: Save other message types, like special events
    bot.on('message', (ctx, next) => {
        // Filter out old messages (1 minute)
        if (ctx.msg.date - startDate.getTime() / 1000 < 1) {
            // console.log(
            //     'Skipping old message',
            //     ctx.msg.date,
            //     startDate.getTime() / 1000,
            // );
            return;
        } else {
            // console.log(
            //     'Processing message',
            //     ctx.msg.date,
            //     startDate.getTime() / 1000,
            // );
        }

        // Ignore opted out users and commands
        if (
            ctx.m.getChat().optOutUsers.some((u) => u.id === ctx.from?.id) &&
            !ctx.msg.text?.startsWith('/optin')
        ) {
            return;
        }

        if (
            commands.some((c) => ctx.msg.text?.startsWith(c))
        ) {
            return next();
        }

        // Save all messages to memory
        let replyTo: ReplyTo | undefined;
        if (ctx.msg.reply_to_message) {
            replyTo = {
                id: ctx.msg.reply_to_message.message_id,
                text: ctx.msg.reply_to_message.text ??
                    ctx.msg.reply_to_message.caption ?? '',
                isMyself: false,
                info: ctx.msg.reply_to_message,
            };
        }

        // Save every message to memory
        ctx.m.addMessage({
            id: ctx.msg.message_id,
            text: ctx.msg.text ?? ctx.msg.caption ?? '',
            replyTo,
            isMyself: false,
            info: ctx.message,
        });

        if (ctx.from) {
            ctx.m.updateUser(ctx.from);
        }

        ctx.m.removeOldMessages(config.maxMessagesToStore);

        return next();
    });

    bot.on(':left_chat_member', (ctx, next) => {
        ctx.m.getChat().members = ctx.m.getChat().members.filter((m) =>
            m.id !== ctx.from?.id
        );

        return next();
    });

    bot.on('edit:text', (ctx, next) => {
        const history = ctx.m.getChat().history;

        for (const msg of history) {
            if (msg.id === ctx.msg.message_id) {
                msg.text = ctx.msg.text ?? ctx.msg.caption ?? '';
            }
        }

        return next();
    });

    bot.on(':migrate_from_chat_id', (ctx, next) => {
        const from = ctx.msg.migrate_from_chat_id;
        const to = ctx.chat.id;

        ctx.memory.chats[to] = ctx.memory.chats[from];
        delete ctx.memory.chats[from];

        logger.debug(
            `Successfully migrated "${ctx.chat.title}" from ${from} to ${to}`,
        );

        return next();
    });

    await bot.init();

    return bot;
}
