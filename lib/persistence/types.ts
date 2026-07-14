import type { Chat as TgChat, Message, User } from 'grammy_types';
import type { Character } from '../charhub/api.ts';
import type { ReplyMessage } from '../telegram/helpers.ts';

export interface ReplyTo {
    id: number;
    text: string;
    info: ReplyMessage;
    isMyself: boolean;
}

export interface ReactionBy {
    id: number;
    username?: string;
    name: string;
}

export interface ReactionRecord {
    type: 'emoji' | 'custom';
    emoji?: string;
    customEmojiId?: string;
    by: ReactionBy[];
    count: number;
}

export interface ReactionDelta {
    emojiAdded: string[];
    emojiRemoved: string[];
    customAdded: string[];
    customRemoved: string[];
}

export type ReactionCountEntry =
    | { type: 'emoji'; emoji: string; total: number }
    | { type: 'custom'; customEmojiId: string; total: number };

export type MessageReactions = { [key: string]: ReactionRecord };

export interface ChatMessage {
    id: number;
    text: string;
    replyTo?: ReplyTo;
    threadId?: string;
    threadRootMessageId?: number;
    threadParentMessageId?: number;
    threadSource?: string;
    isMyself: boolean;
    info: Message;
    reactions?: MessageReactions;
}

export interface OptOutUser {
    id: number;
    username?: string;
    first_name: string;
}

export interface Member {
    id: number;
    username?: string;
    first_name: string;
    info: User;
    lastUse: number;
}

export interface BotCharacter extends Character {
    names: string[];
}

export interface Chat {
    history: ChatMessage[];
    lastUse: number;
    info: TgChat;
    chatModel?: string;
    character?: BotCharacter;
    optOutUsers: OptOutUser[];
    members: Member[];
    messagesToPass?: number;
    randomReplyProbability?: number;
    hateMode?: boolean;
    locale?: string;
    disableRepliesDueToRights?: boolean;
    disabledReplyRightsLastProbeAt?: number;
}
