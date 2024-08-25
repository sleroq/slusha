import logger from './logger.ts';

export interface Sender {
    id: number;
    name: string;
    username: string | undefined;
    myself?: boolean;
}

export interface ChatMessage {
    id: number;
    sender: Sender;
    replyTo?: {
        id: number;
        sender: Sender;
        text: string;
    };
    date: number;
    text: string;
    isSummary: boolean;
}

export interface Chat {
    notes: string[];
    lastNotes: number;
    history: ChatMessage[];
    type: string;
    lastUse: number;
}

export interface Memory {
    chats: {
        [key: string]: Chat;
    };
    unsavedMsgsCount: number;
}

export async function loadMemory(): Promise<Memory> {
    let data;

    try {
        data = await Deno.readTextFile('memory.json');
    } catch (error) {
        logger.warn('reading memory: ', error);
        return { chats: {}, unsavedMsgsCount: 0 };
    }

    let parsedData: Memory;
    try {
        parsedData = JSON.parse(data);
    } catch (error) {
        logger.warn('parsing memory: ', error);
        return { chats: {}, unsavedMsgsCount: 0 };
    }

    return parsedData;
}

/**
 * Returns chat data, creates new one if it does not exist
 */
export function getChat(
    m: Memory,
    chatId: number,
    chatType: string,
) {
    let chat = m.chats[chatId];

    if (!m.chats[chatId]) {
        chat = {
            notes: [],
            lastNotes: 0,
            history: [],
            type: chatType,
            lastUse: Date.now(),
        };

        m.chats[chatId] = chat;
    }

    return chat;
}

export function saveMemory(m: Memory) {
    const jsonData = JSON.stringify(m, null, 2);

    return Deno.writeTextFile('memory.json', jsonData);
}
