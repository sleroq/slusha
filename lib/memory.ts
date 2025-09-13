import { Chat as TgChat, Message, User } from 'grammy_types';
import logger from './logger.ts';
import { ReplyMessage } from './telegram/helpers.ts';
import { Character } from './charhub/api.ts';

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

export type MessageReactions = { [key: string]: ReactionRecord };

function reactionKey(
    reaction:
        | { type: 'emoji'; emoji: string }
        | { type: 'custom'; customEmojiId: string },
): string {
    return reaction.type === 'emoji'
        ? `e:${reaction.emoji}`
        : `c:${reaction.customEmojiId}`;
}

export interface ChatMessage {
    id: number;
    text: string;
    replyTo?: ReplyTo;
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
    description: string;
    info: User;
    lastUse: number;
}

export interface BotCharacter extends Character {
    names: string[];
}

export interface Chat {
    notes: string[];
    lastNotes: number;
    lastMemory: number;
    history: ChatMessage[];
    memory?: string;
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
}

export class Memory {
    chats: {
        [key: string]: Chat;
    };

    constructor(data?: NonFunctionProperties<Memory>) {
        if (!data) data = { chats: {} };
        this.chats = data.chats;
    }

    getChat(tgChat: TgChat) {
        let chat = this.chats[tgChat.id];

        if (!chat) {
            chat = {
                notes: [],
                lastNotes: 0,
                lastMemory: 0,
                history: [],
                lastUse: Date.now(),
                info: tgChat,
                optOutUsers: [],
                members: [],
            };

            this.chats[tgChat.id] = chat;
        }

        return chat;
    }

    save() {
        const jsonData = JSON.stringify(this);
        return Deno.writeTextFile('memory.json', jsonData);
    }
}

// Class avalivle when handling message
// with functionality specific to current chat
// like get previous messages from this user, get last notes, etc
export class ChatMemory {
    memory: Memory;
    chatInfo: TgChat;

    constructor(memory: Memory, chat: TgChat) {
        this.memory = memory;
        this.chatInfo = chat;
    }

    getChat() {
        return this.memory.getChat(this.chatInfo);
    }

    getHistory() {
        return this.getChat().history;
    }

    clear() {
        this.getChat().history = [];
        this.getChat().lastNotes = 0;
    }

    getLastMessage() {
        // TODO: Fix this
        return this.getHistory().slice(-1)[0];
    }

    addMessage(message: ChatMessage) {
        this.getHistory().push(message);
    }

    removeOldMessages(maxLength: number) {
        const history = this.getHistory();
        if (history.length > maxLength) {
            history.splice(0, maxLength);
        }
    }

    removeOldNotes(maxLength: number) {
        const notes = this.getChat().notes;
        if (notes.length > maxLength) {
            notes.splice(0, maxLength);
        }
    }

    updateUser(user: User) {
        const chat = this.getChat();
        if (!chat.members) {
            chat.members = [];
        }

        const member: Member = {
            id: user.id,
            username: user.username,
            first_name: user.first_name,
            info: user,
            description: '',
            lastUse: Date.now(),
        };

        const userIndex = chat.members.findIndex((u) => u.id === user.id);
        if (userIndex === -1) {
            chat.members.push(member);
        } else {
            chat.members[userIndex] = member;
        }
    }

    /**
     * Returns list of active members in chat
     * with last use less than 3 days ago
     * @returns Member[]
     */
    getActiveMembers(days = 7, limit = 10) {
        const chat = this.getChat();
        if (!chat.members) {
            return [];
        }

        const activeMembers = chat.members.filter((m) =>
            m.lastUse > Date.now() - 1000 * 60 * 60 * 24 * days
        );

        return activeMembers.slice(0, limit);
    }

    getMessageById(messageId: number) {
        return this.getHistory().find((m) => m.id === messageId);
    }

    addEmojiReaction(
        messageId: number,
        emoji: string,
        by?: Pick<User, 'id' | 'username' | 'first_name'>,
    ) {
        this.upsertReaction(messageId, { type: 'emoji', emoji }, by);
    }

    removeEmojiReaction(
        messageId: number,
        emoji: string,
        by?: Pick<User, 'id' | 'username' | 'first_name'>,
    ) {
        this.removeReaction(messageId, { type: 'emoji', emoji }, by);
    }

    addCustomReaction(
        messageId: number,
        customEmojiId: string,
        by?: Pick<User, 'id' | 'username' | 'first_name'>,
    ) {
        this.upsertReaction(messageId, { type: 'custom', customEmojiId }, by);
    }

    removeCustomReaction(
        messageId: number,
        customEmojiId: string,
        by?: Pick<User, 'id' | 'username' | 'first_name'>,
    ) {
        this.removeReaction(messageId, { type: 'custom', customEmojiId }, by);
    }

    setReactionCounts(
        messageId: number,
        counts: Array<
            | { type: 'emoji'; emoji: string; total: number }
            | { type: 'custom'; customEmojiId: string; total: number }
        >,
    ) {
        const msg = this.getMessageById(messageId);
        if (!msg) return;
        if (!msg.reactions) msg.reactions = {};

        for (const c of counts) {
            const key = reactionKey(
                (c.type === 'emoji'
                    ? { type: 'emoji', emoji: c.emoji }
                    : { type: 'custom', customEmojiId: c.customEmojiId }) as
                        | { type: 'emoji'; emoji: string }
                        | { type: 'custom'; customEmojiId: string },
            );
            const existing = msg.reactions[key];
            if (!existing) {
                msg.reactions[key] = {
                    type: c.type,
                    emoji: c.type === 'emoji' ? c.emoji : undefined,
                    customEmojiId: c.type === 'custom'
                        ? c.customEmojiId
                        : undefined,
                    by: [],
                    count: c.total,
                };
            } else {
                existing.count = c.total;
                msg.reactions[key] = existing;
            }
        }
    }

    private upsertReaction(
        messageId: number,
        reaction:
            | { type: 'emoji'; emoji: string }
            | { type: 'custom'; customEmojiId: string },
        by?: Pick<User, 'id' | 'username' | 'first_name'>,
    ) {
        const msg = this.getMessageById(messageId);
        if (!msg) return;
        if (!msg.reactions) msg.reactions = {};

        const key = reactionKey(reaction);
        let rec = msg.reactions[key];
        if (!rec) {
            rec = msg.reactions[key] = {
                type: reaction.type,
                emoji: reaction.type === 'emoji' ? reaction.emoji : undefined,
                customEmojiId: reaction.type === 'custom'
                    ? reaction.customEmojiId
                    : undefined,
                by: [],
                count: 0,
            };
        }

        rec.count = Math.max(1, rec.count + 1);
        if (by) {
            const existingIdx = rec.by.findIndex((u) => u.id === by.id);
            const userRec = {
                id: by.id,
                username: by.username,
                name: by.first_name,
            } as ReactionBy;
            if (existingIdx === -1) rec.by.push(userRec);
            else rec.by[existingIdx] = userRec;
        }
    }

    private removeReaction(
        messageId: number,
        reaction:
            | { type: 'emoji'; emoji: string }
            | { type: 'custom'; customEmojiId: string },
        by?: Pick<User, 'id' | 'username' | 'first_name'>,
    ) {
        const msg = this.getMessageById(messageId);
        if (!msg || !msg.reactions) return;

        const key = reactionKey(reaction);
        const rec = msg.reactions[key];
        if (!rec) return;

        if (by) {
            rec.by = rec.by.filter((u) => u.id !== by.id);
        }

        if (rec.count > 0) rec.count -= 1;
        if (rec.count <= 0 && rec.by.length === 0) {
            delete msg.reactions[key];
        } else {
            msg.reactions[key] = rec;
        }
    }
}

type NonFunctionPropertyNames<T> = {
    // deno-lint-ignore ban-types
    [K in keyof T]: T[K] extends Function ? never : K;
}[keyof T];

type NonFunctionProperties<T> = Pick<T, NonFunctionPropertyNames<T>>;

export async function loadMemory(): Promise<Memory> {
    let data;
    try {
        data = await Deno.readTextFile('memory.json');
    } catch (error) {
        logger.warn('reading memory: ', error);
        return new Memory();
    }

    let parsedData: NonFunctionProperties<Memory>;
    try {
        parsedData = JSON.parse(data);
    } catch (error) {
        logger.warn('parsing memory: ', error);
        return new Memory();
    }

    return new Memory(parsedData);
}
