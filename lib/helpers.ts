import {
    Message,
    ReplyMessage,
    Sticker,
    Update,
} from 'https://deno.land/x/grammy@v1.14.1/types.deno.ts';
import { ChatMessage } from './memory.ts';

interface Environment {
    AI: {
        url: string;
        model: string;
        token?: string;
        prompt: string;
        finalPrompt: string;
        notesPrompt?: string;
    };
    contextTimeout: number;
    contextLimit: number;
    memoryTimeout: number;
    messageMaxLength: number;
    randomReply: number;
    botToken: string;
}

const DEFAULT_MODEL = 'gpt-3.5-turbo-16k';
const DEFAULT_URL = 'https://api.openai.com/v1/chat/completions';
const DEFAULT_PROMPT = `
You are a bot Слюша, created by @sleroq. Help other people and answer funny.
`;
const DEFAULT_FINAL_PROMPT = 'Answer must only contain have your reply text.';

const DEFAULT_CONTEXT_LIMIT = 40;
const DEFAULT_CONTEXT_TIMEOUT = 60 * 24 * 7; // In minutes
const DEFAULT_MEMORY_TIMEOUT = 60 * 24 * 7; // In minutes
const DEFAULT_MESSAGES_MAX_LENGTH = 600; // In minutes
const DEFAULT_RANDOM_REPLY = 1; // Percentage of messages bot will reply by itself

export function resolveEnv(): Environment {
    const botToken = Deno.env.get('BOT_TOKEN');
    if (!botToken) throw new Error('BOT_TOKEN is required');

    const url = Deno.env.get('AI_API_URL');
    const model = Deno.env.get('AI_MODEL');
    const AI_token = Deno.env.get('AI_AUTH_TOKEN');
    let prompt = Deno.env.get('AI_SYSTEM_PROMPT');
    prompt = prompt?.replaceAll('\n', ' ');
    let finalPrompt = Deno.env.get('AI_FINAL_PROMPT');
    finalPrompt = finalPrompt?.replaceAll('\n', ' ');
    let notesPrompt = Deno.env.get('AI_NOTES_PROMPT');
    notesPrompt = notesPrompt?.replaceAll('\n', ' ');

    const contextTimeout = Deno.env.get('BOT_CONTEXT_TIMEOUT');
    const contextLimit = Deno.env.get('BOT_CONTEXT_LIMIT');
    const maxRetries = Deno.env.get('BOT_MAX_RETRIES');
    const messagesMaxLength = Deno.env.get('BOT_MESSAGES_MAX_LENGTH');
    const randomReply = Deno.env.get('BOT_RANDOM_REPLY');

    return {
        AI: {
            url: url || DEFAULT_URL,
            model: model || DEFAULT_MODEL,
            token: AI_token,
            prompt: prompt || DEFAULT_PROMPT,
            finalPrompt: finalPrompt || DEFAULT_FINAL_PROMPT,
            notesPrompt: notesPrompt,
        },
        contextTimeout: Number(contextTimeout) || DEFAULT_CONTEXT_TIMEOUT,
        contextLimit: Number(contextLimit) || DEFAULT_CONTEXT_LIMIT,
        memoryTimeout: Number(maxRetries) || DEFAULT_MEMORY_TIMEOUT,
        messageMaxLength: Number(messagesMaxLength) ||
            DEFAULT_MESSAGES_MAX_LENGTH,
        randomReply: Number(randomReply) || DEFAULT_RANDOM_REPLY,
        botToken,
    };
}

export function getRandomInt(min: number, max: number) {
    min = Math.ceil(min);
    max = Math.floor(max);
    return Math.floor(Math.random() * (max - min) + min); // The maximum is exclusive and the minimum is inclusive
}

export function stickerToText({ emoji }: Sticker): string {
    return emoji ? `[Sticker ${emoji}]` : '[Sticker]';
}

export function removeBotName(
    response: string,
    name: string,
    username: string,
) {
    const regexFull = new RegExp(`^${name}\\s*\\(@${username}\\):\\s*`, 'gmi');
    const regexName = new RegExp(`^${name}\\s*:\\s*`, 'gmi');
    response = response.replace(regexFull, '');
    return response.replace(regexName, '');
}

export function sliceMessage(message: string, maxLength: number): string {
    return message.length > maxLength
        ? message.slice(0, maxLength) + '...'
        : message;
}

interface HistoryOptions {
    simbolLimit?: number;
    usernames?: boolean;
}

export function makeHistoryString(
    history: ChatMessage[],
    { simbolLimit, usernames }: HistoryOptions = {},
): string {
    if (!simbolLimit) simbolLimit = 1000;
    if (!usernames) usernames = true;

    let result = '';
    for (let i = 0; i < history.length; i++) {
        const message = history[i];
        let context = `${message.sender.name} (@${message.sender.username}): `;
        if (!usernames) {
            context = `${message.sender.name}: `;
        }

        if (message.replyTo && !message.sender.myself) {
            // Add original message if this is last message in history
            if (i == history.length - 1) {
                const replyText = sliceMessage(
                    message.replyTo.text,
                    simbolLimit,
                );
                context +=
                    `(in reply to: ${message.replyTo.sender.name} > "${replyText}"): `;
            } else {
                context += `(in reply to: ${message.replyTo.sender.name}): `;
            }
        }

        context += sliceMessage(message.text, simbolLimit);

        result += context + '\n';
    }

    return result;
}

export function getText(
    msg: (Message & Update.NonChannel) | ReplyMessage,
    botId: number,
) {
    let text = msg.text || '';

    if (msg.sticker) {
        text += stickerToText(msg.sticker);
    }

    if (msg.caption) {
        text += msg.caption;
    }

    // Replace new lines with spaces
    text = text.replace(/[\n\r]/g, ' ');

    if (!text.trim()) return;

    if (msg.forward_from && msg.forward_from.id !== botId) {
        const from = msg.forward_from.first_name.slice(0, 20);
        text = `(forwarded from ${from}): ${text}`;
    }
    if (msg.forward_from_chat && 'title' in msg.forward_from_chat) {
        const from = msg.forward_from_chat.title.slice(0, 20);
        text = `(forwarded from ${from}): ${text}`;
    }

    const attachments: (keyof (Message & Update.NonChannel))[] = [
        'photo',
        'video',
        'animation',
        'audio',
        'voice',
        'document',
        'video_note',
        'contact',
        'location',
        'venue',
        'poll',
        'dice',
        'game',
    ];

    const attachmentsText = attachments.reduce((acc, key) => {
        if (msg[key]) {
            acc += ` [${key}]`;
        }

        return acc;
    }, '');

    text += attachmentsText;

    return text;
}
