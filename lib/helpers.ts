import { RequestMessage } from '../ai-api.ts';
import { ChatMessage } from '../main.ts';

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
const DEFAULT_FINAL_PROMPT =
    'Answer should consist only from YOUR (Слюша) reply.';

const DEFAULT_CONTEXT_LIMIT = 20;
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

export function assembleHistory(history: ChatMessage[]): RequestMessage[] {
    const messages: RequestMessage[] = [];

    for (let i = 0; i < history.length; i++) {
        const message = history[i];
        let context = '';

        if (message.replyTo && !message.sender.myself) {
            // Add original message if this is last message in history
            if (i == history.length - 1) {
                context +=
                    `(Reply to: ${message.replyTo.sender.name}): > ${message.replyTo.text}\n`;
            } else {
                context += `(Reply to: ${message.replyTo.sender.name}):\n`;
            }
        }
        context +=
            `${message.sender.name} (@${message.sender.username}): ${message.text}`;

        if (message.sender.myself) {
            messages.push({ role: 'assistant', content: context });
        } else {
            messages.push({ role: 'user', content: context });
        }
    }

    return messages;
}

export function getRandomInt(min: number, max: number) {
    min = Math.ceil(min);
    max = Math.floor(max);
    return Math.floor(Math.random() * (max - min) + min); // The maximum is exclusive and the minimum is inclusive
}
