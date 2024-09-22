import {
    Chat as TgChat,
    Message,
    PhotoSize,
} from 'https://deno.land/x/grammy@v1.30.0/types.deno.ts';
import logger from './logger.ts';

export interface Sender {
    id: number;
    name: string;
    username: string | undefined;
    myself?: boolean;
}

type ReplyTo =
    | {
        id: number;
        sender: Sender;
        text: string;
        photo: PhotoSize[];
        media_group_id?: string;
    }
    | {
        id: number;
        sender: Sender;
        text: string;
    };

export interface ChatMessage {
    id: number;
    sender: Sender;
    replyTo?: ReplyTo;
    date: number;
    text: string;
    isSummary: boolean;
    info: Message;
}

export interface Chat {
    notes: string[];
    lastNotes: number;
    history: ChatMessage[];
    lastUse: number;
    info: TgChat;
    chatModel?: string;
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
                history: [],
                lastUse: Date.now(),
                info: tgChat,
            };

            this.chats[tgChat.id] = chat;
        }

        return chat;
    }

    save() {
        const jsonData = JSON.stringify(this, null, 2);

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
