import ky from 'https://esm.sh/ky';
import Werror from './lib/werror.ts';
import { ChatMessage } from './main.ts';
import { assembleHistory } from './helpers.ts';

interface Choise {
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
    choices: Choise[];
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
function printLatestMesssages(messages: RequestMessage[]) {
    console.log('-'.repeat(20));
    const lastMessages = messages.slice(-4);
    for (const message of lastMessages) {
        console.log(`${message.role}: ${message.content}`);
    }
    console.log('-'.repeat(20));
}

export default class AIApi {
    url: string
    model: string
    authToken: string | undefined
    systemPrompt: string

    constructor(url: string, systemPrompt: string, model: string, token?: string) {
        this.url = url;
        this.systemPrompt = systemPrompt;
        this.model = model;

        if (token) {
            this.authToken = token
        }
    }

    async ask(
        question: string,
        history: ChatMessage[],
    ): Promise<string> {
        const context = assembleHistory(history, this.systemPrompt);

        const reqData: ApiRequest = {
            model: this.model,
            messages: [
                { role: 'system', content: this.systemPrompt },
                ...context,
                { role: 'system', content: question },
            ],
            temperature: 0.9,
        };

        printLatestMesssages(reqData.messages);

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
            console.log(reqData);
            throw new Werror(err, 'Fetching response from api');
        }

        let resData: ApiResponse;
        try {
            resData = await res.json();
        } catch (err) {
            throw new Werror(err, 'Parsing data');
        }


        if (resData.choices.length === 0) {
            throw new Error('No response choises recieved from api')
        }

        return resData.choices[0].message.content;
    }
}
