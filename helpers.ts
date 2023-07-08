import { RequestMessage } from "./ai-api.ts";
import { ChatMessage } from "./main.ts";

interface Environment {
    url: string
    model: string
    token?: string
    prompt: string
}

const DEFAULT_MODEL = 'gpt-3.5-turbo-16k';
const DEFAULT_URL = 'https://api.openai.com/v1/chat/completions';
const DEFAULT_PROMPT = `
You are a bot Слюша, created by @sleroq. Help other people and answer funny.
`;

export function resolveEnv(): Environment {
    const url = Deno.env.get('AI_API_URL');
    const model = Deno.env.get('AI_MODEL');
    const token = Deno.env.get('AI_AUTH_TOKEN');
    const prompt = Deno.env.get('BOT_PROMPT');

    return {
        url: url || DEFAULT_URL,
        model: model || DEFAULT_MODEL,
        token,
        prompt: prompt || DEFAULT_PROMPT,
    }
}

export function assembleHistory(history: ChatMessage[], systemPrompt: string): RequestMessage[] {
    const messages: RequestMessage[] = [];

    for (let i = 0; i < history.length; i++) {
        const message = history[i];
        let context = '';

        // Repeat system prompt every 25 messages
        if (i % 20 == 0) {
            messages.push({ role: 'system', content: systemPrompt });
        }

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