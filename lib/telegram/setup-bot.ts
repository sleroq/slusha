import { Bot, Context } from 'grammy';
import { I18nFlavor } from '@grammyjs/i18n';
import logger from '../logger.ts';
import { Config } from '../config.ts';
import {
    ChatMemory,
    Memory,
    ReactionCountEntry,
    ReactionDelta,
    ReplyTo,
} from '../memory.ts';
import { sequentialize } from '@grammyjs/runner';
import { canMemberSendTextMessages } from './reply-rights.ts';
import { Message } from 'grammy_types';

interface RequestInfo {
    isRandom: boolean;
    userToReply?: string;
    config: Config['ai'];
}

interface ThreadResolution {
    threadId: string;
    threadRootMessageId: number;
    threadParentMessageId?: number;
    threadSource: string;
}

export type SlushaContext = Context & I18nFlavor & {
    info: RequestInfo;
    memory: Memory;
    m: ChatMemory;
};

function isEmojiReactionType(
    obj: unknown,
): obj is { type: 'emoji'; emoji: string } {
    return getUnknownProp(obj, 'type') === 'emoji' &&
        typeof getUnknownProp(obj, 'emoji') === 'string';
}

function isCustomReactionType(
    obj: unknown,
): obj is { type: 'custom_emoji'; custom_emoji_id: string } {
    return getUnknownProp(obj, 'type') === 'custom_emoji' &&
        typeof getUnknownProp(obj, 'custom_emoji_id') === 'string';
}

function getUnknownProp(obj: unknown, key: string): unknown {
    if (typeof obj !== 'object' || obj === null) return undefined;
    return Reflect.get(obj, key);
}

function pickCount(obj: unknown): number | undefined {
    const totalCount = getUnknownProp(obj, 'total_count');
    if (typeof totalCount === 'number') return totalCount;

    const count = getUnknownProp(obj, 'count');
    if (typeof count === 'number') return count;

    const total = getUnknownProp(obj, 'total');
    if (typeof total === 'number') return total;

    return undefined;
}

function parseReactionSet(raw: unknown): { emoji: string[]; custom: string[] } {
    const out = { emoji: [] as string[], custom: [] as string[] };
    if (!Array.isArray(raw)) return out;

    for (const reaction of raw) {
        if (isEmojiReactionType(reaction)) out.emoji.push(reaction.emoji);
        else if (isCustomReactionType(reaction)) {
            out.custom.push(reaction.custom_emoji_id);
        }
    }

    return out;
}

function parseReactionDelta(messageReaction: unknown): ReactionDelta {
    const added = parseReactionSet(
        getUnknownProp(messageReaction, 'new_reaction'),
    );
    const removed = parseReactionSet(
        getUnknownProp(messageReaction, 'old_reaction'),
    );

    return {
        emojiAdded: added.emoji,
        emojiRemoved: removed.emoji,
        customAdded: added.custom,
        customRemoved: removed.custom,
    };
}

function parseReactionCounts(
    messageReactionCount: unknown,
): ReactionCountEntry[] {
    const rawCounts = getUnknownProp(messageReactionCount, 'reactions') ??
        getUnknownProp(messageReactionCount, 'reaction_counts') ??
        [];
    const arr = Array.isArray(rawCounts) ? rawCounts : [];

    return arr.map((reaction: unknown) => {
        const type = getUnknownProp(reaction, 'type') ?? reaction;

        if (isEmojiReactionType(type)) {
            return {
                type: 'emoji' as const,
                emoji: type.emoji,
                total: pickCount(reaction) ?? 0,
            };
        }

        if (isCustomReactionType(type)) {
            return {
                type: 'custom' as const,
                customEmojiId: type.custom_emoji_id,
                total: pickCount(reaction) ?? 0,
            };
        }

        return undefined;
    }).filter((entry): entry is ReactionCountEntry => entry !== undefined);
}

function isSameTopic(left: Message, right: Message): boolean {
    const leftTopic = left.message_thread_id;
    const rightTopic = right.message_thread_id;
    return leftTopic === rightTopic;
}

async function resolveThreadForIncomingMessage(
    memory: ChatMemory,
    incoming: Message,
    replyToId?: number,
): Promise<ThreadResolution> {
    if (typeof replyToId === 'number') {
        const parent = await memory.getMessageById(replyToId);
        const inheritedRoot = parent?.threadRootMessageId ?? replyToId;
        const inheritedThread = parent?.threadId ?? `thread:${inheritedRoot}`;

        return {
            threadId: inheritedThread,
            threadRootMessageId: inheritedRoot,
            threadParentMessageId: replyToId,
            threadSource: parent ? 'explicit_reply' : 'explicit_reply_external',
        };
    }

    const incomingAuthorId = incoming.from?.id;
    const incomingDate = incoming.date;
    const maxGapSeconds = 180;
    const maxInterveningMessages = 6;

    if (typeof incomingAuthorId === 'number') {
        const candidate = await memory.getLastMessageByAuthorInTopic(
            incomingAuthorId,
            incoming.message_thread_id,
            maxInterveningMessages + 1,
        );

        if (candidate && isSameTopic(candidate.info, incoming)) {
            const candidateDate = candidate.info.date;
            const secondsSince = incomingDate - candidateDate;
            if (secondsSince <= maxGapSeconds) {
                const inheritedRoot = candidate.threadRootMessageId ??
                    candidate.id;
                const inheritedThread = candidate.threadId ??
                    `thread:${inheritedRoot}`;
                return {
                    threadId: inheritedThread,
                    threadRootMessageId: inheritedRoot,
                    threadParentMessageId: candidate.id,
                    threadSource: 'implicit_same_author',
                };
            }
        }
    }

    return {
        threadId: `thread:${incoming.message_id}`,
        threadRootMessageId: incoming.message_id,
        threadSource: 'new_thread',
    };
}

// TODO: Maybe derive from bot info somehow?
const commands = [
    '/optout',
    '/model',
    '/lobotomy',
    '/random',
    '/summary',
    '/language',
    '/config',
    '/usage',
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

    bot.use(async (ctx, next) => {
        // Init custom context
        ctx.memory = memory;
        let aiConfig = config.ai;
        if (ctx.chat) {
            ctx.m = new ChatMemory(memory, ctx.chat);
            const effective = await ctx.m.getEffectiveConfig();
            aiConfig = effective.ai;
        }
        ctx.info = { isRandom: false, config: aiConfig };

        return next();
    });

    // Reaction updates (added/removed/changed by users)
    bot.on('message_reaction', async (ctx, next) => {
        try {
            const mr = ctx.update.message_reaction;
            if (!mr) return next();
            const messageId = mr.message_id;
            const chat = ctx.chat;
            if (!chat) return next();
            const delta = parseReactionDelta(mr);

            const by = ctx.from
                ? {
                    id: ctx.from.id,
                    username: ctx.from.username,
                    first_name: ctx.from.first_name,
                }
                : undefined;
            await ctx.m.applyReactionDelta(messageId, delta, by);
        } catch (error) {
            logger.warn('Could not process message_reaction: ', error);
        }

        return next();
    });

    // Channel reaction counts (anonymous) or forwarded channel posts in groups
    bot.on('message_reaction_count', async (ctx, next) => {
        try {
            const mrc = ctx.update.message_reaction_count;
            if (!mrc) return next();
            const messageId = mrc.message_id;
            const counts = parseReactionCounts(mrc);
            await ctx.m.replaceReactionCounts(messageId, counts);
        } catch (error) {
            logger.warn('Could not process message_reaction_count: ', error);
        }
        return next();
    });

    // TODO: Save other message types, like special events
    bot.on('message', async (ctx, next) => {
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
            (await ctx.m.getChat()).optOutUsers.some((u) =>
                u.id === ctx.from?.id
            ) &&
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
        let replyToId: number | undefined;
        if (ctx.msg.reply_to_message) {
            replyToId = ctx.msg.reply_to_message.message_id;
            replyTo = {
                id: replyToId,
                text: ctx.msg.reply_to_message.text ??
                    ctx.msg.reply_to_message.caption ?? '',
                isMyself: false,
                info: ctx.msg.reply_to_message,
            };
        }

        const threadResolution = await resolveThreadForIncomingMessage(
            ctx.m,
            ctx.msg,
            replyToId,
        );

        // Save every message to memory
        await ctx.m.addMessage({
            id: ctx.msg.message_id,
            text: ctx.msg.text ?? ctx.msg.caption ?? '',
            replyTo,
            threadId: threadResolution.threadId,
            threadRootMessageId: threadResolution.threadRootMessageId,
            threadParentMessageId: threadResolution.threadParentMessageId,
            threadSource: threadResolution.threadSource,
            isMyself: false,
            info: ctx.message,
        });

        if (ctx.from) {
            await ctx.m.updateUser(ctx.from);
        }

        const effectiveConfig = await ctx.m.getEffectiveConfig();
        await ctx.m.removeOldMessages(effectiveConfig.maxMessagesToStore);

        return next();
    });

    bot.on('my_chat_member', async (ctx, next) => {
        try {
            const update = ctx.update.my_chat_member;
            if (!update) return next();

            if (canMemberSendTextMessages(update.new_chat_member)) {
                await ctx.m.setDisableRepliesDueToRights(false);
                await ctx.m.setDisabledReplyRightsLastProbeAt(undefined);
            } else {
                await ctx.m.setDisableRepliesDueToRights(true);
                await ctx.m.setDisabledReplyRightsLastProbeAt(Date.now());
            }
        } catch (error) {
            logger.warn('Could not process my_chat_member update: ', error);
        }

        return next();
    });

    bot.on(':left_chat_member', async (ctx, next) => {
        if (ctx.from?.id) {
            await ctx.m.removeMember(ctx.from.id);
        }

        return next();
    });

    bot.on('edit:text', async (ctx, next) => {
        await ctx.m.updateMessageText(
            ctx.msg.message_id,
            ctx.msg.text ?? ctx.msg.caption ?? '',
        );

        return next();
    });

    bot.on(':migrate_from_chat_id', async (ctx, next) => {
        const from = ctx.msg.migrate_from_chat_id;
        const to = ctx.chat.id;

        await ctx.memory.migrateChat(from, to, ctx.chat);

        logger.debug(
            `Successfully migrated "${ctx.chat.title}" from ${from} to ${to}`,
        );

        return next();
    });

    await bot.init();

    return bot;
}
