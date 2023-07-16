import ky from 'https://esm.sh/ky';
import Werror from './lib/werror.ts';

interface Choice {
    index: number;
    message: {
        role: 'assistant';
        content: string;
    };
    finish_reason: string;
}

interface ApiResponse {
    id: string;
    object: 'chat.completion';
    created: number;
    model: string;
    choices: Choice[];
    usage: {
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
    };
}

export interface RequestMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
}

interface ApiRequest {
    model: string;
    messages: RequestMessage[];
    temperature: number;
}

// print only last messages
function printLatestMessages(messages: RequestMessage[]) {
    console.log('-'.repeat(20));
    const lastMessages = messages.slice(-10);
    for (const message of lastMessages) {
        console.log(`${message.role}: ${message.content}`);
    }
    console.log('-'.repeat(20));
}

export default class AIApi {
    url: string;
    model: string;
    authToken: string | undefined;
    systemPrompt: string;

    constructor(
        url: string,
        systemPrompt: string,
        model: string,
        token?: string,
    ) {
        this.url = url;
        this.systemPrompt = systemPrompt;
        this.model = model;

        if (token) {
            this.authToken = token;
        }
    }

    async ask(messages: RequestMessage[]) {
        const reqData: ApiRequest = {
            model: this.model,
            messages,
            temperature: 0.8,
        };

        const headers: { [key in string]: string } = {};
        if (this.authToken) {
            headers['Authorization'] = `Bearer ${this.authToken}`;
        }

        let res;
        try {
            res = await ky.post(this.url, {
                headers,
                timeout: 2 * 60 * 1000,
                json: reqData,
            });
        } catch (err) {
            throw new Werror(err, 'Fetching response from api');
        }

        let resData: ApiResponse;
        try {
            resData = await res.json();
        } catch (err) {
            throw new Werror(err, 'Parsing data');
        }

        if (resData.choices.length === 0) {
            throw new Error('No response chooses received from api');
        }

        return resData.choices[0].message.content;
    }

    chatReply(
        question: string,
        history: RequestMessage[],
        summary?: string,
    ): Promise<string> {
        let messages: RequestMessage[] = [
            { role: 'system', content: this.systemPrompt },
        ];

        if (summary) {
            const summaryPreamble = `
            This is key notes and memories written by you earlier to remember:
            `;
            messages.push({
                role: 'system',
                content: summaryPreamble + summary,
            });
        }

        messages = messages.concat([
            ...history,
            { role: 'system', content: question },
        ]);

        return this.ask(messages);
    }
}
