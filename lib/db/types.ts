import type {
    ChatMessage,
    MessageReactions,
    ReactionRecord,
} from '../memory.ts';

export type DbId = bigint;

export function makeMessageReactions(
    records: ReactionRecord[],
): MessageReactions {
    const out: MessageReactions = {};

    for (const rec of records) {
        const key = rec.type === 'emoji' && rec.emoji
            ? `e:${rec.emoji}`
            : rec.type === 'custom' && rec.customEmojiId
            ? `c:${rec.customEmojiId}`
            : undefined;

        if (!key) {
            continue;
        }

        out[key] = rec;
    }

    return out;
}

export function toMemoryChatMessage(args: {
    telegramId: number;
    text: string;
    isMyself: boolean;
    telegramInfo: unknown;
    reactions?: MessageReactions;
}): ChatMessage {
    return {
        id: args.telegramId,
        text: args.text,
        isMyself: args.isMyself,
        info: args.telegramInfo as ChatMessage['info'],
        reactions: args.reactions,
    };
}
