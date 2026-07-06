import { Composer } from 'grammy';
import logger from '../../logger.ts';
import type {
    ReactionCountEntry,
    ReactionDelta,
} from '../../persistence/types.ts';
import type { SlushaContext } from '../setup-bot.ts';
import type {
    MessageReactionCountUpdated,
    MessageReactionUpdated,
    ReactionType,
} from 'https://deno.land/x/grammy_types@v3.21.0/message.ts';

function parseReactionSet(
    raw: ReactionType[],
): { emoji: string[]; custom: string[] } {
    const out = { emoji: [] as string[], custom: [] as string[] };

    for (const reaction of raw) {
        switch (reaction.type) {
            case 'emoji':
                out.emoji.push(reaction.emoji);
                break;
            case 'custom_emoji':
                out.custom.push(reaction.custom_emoji_id);
                break;
        }
    }

    return out;
}

function parseReactionDelta(messageReaction: MessageReactionUpdated): ReactionDelta {
    const added = parseReactionSet(messageReaction.new_reaction);
    const removed = parseReactionSet(messageReaction.old_reaction);

    return {
        emojiAdded: added.emoji,
        emojiRemoved: removed.emoji,
        customAdded: added.custom,
        customRemoved: removed.custom,
    };
}

function parseReactionCounts(
    messageReactionCount: MessageReactionCountUpdated,
): ReactionCountEntry[] {
    const entries: ReactionCountEntry[] = [];

    for (const reaction of messageReactionCount.reactions) {
        switch (reaction.type.type) {
            case 'emoji':
                entries.push({
                    type: 'emoji' as const,
                    emoji: reaction.type.emoji,
                    total: reaction.total_count,
                });
                break;
            case 'custom_emoji':
                entries.push({
                    type: 'custom' as const,
                    customEmojiId: reaction.type.custom_emoji_id,
                    total: reaction.total_count,
                });
                break;
            case 'paid':
                // TODO: Support paid reactions in some way
                break;
        }
    }

    return entries;
}

const reactions = new Composer<SlushaContext>();

// Reaction updates (added/removed/changed by users)
reactions.on('message_reaction', async (ctx, next) => {
    const mr = ctx.update.message_reaction;
    const messageId = mr.message_id;
    const delta = parseReactionDelta(mr);

    const by = ctx.from
        ? {
            id: ctx.from.id,
            username: ctx.from.username,
            first_name: ctx.from.first_name,
        }
        : undefined;
    await ctx.messages.applyReactionDelta(messageId, delta, by);

    return next();
});

// Channel reaction counts (anonymous) or forwarded channel posts in groups
reactions.on('message_reaction_count', async (ctx, next) => {
    try {
        const mrc = ctx.update.message_reaction_count;
        if (!mrc) return next();
        const messageId = mrc.message_id;
        const counts = parseReactionCounts(mrc);
        await ctx.messages.replaceReactionCounts(messageId, counts);
    } catch (error) {
        logger.warn('Could not process message_reaction_count: ', error);
    }
    return next();
});

export default reactions;
