import { Bot } from 'grammy';
import type { Chat as TgChat } from 'grammy_types';
import { Memory } from '../memory.ts';
import { SlushaContext } from '../telegram/setup-bot.ts';

export interface RuntimeConfigAccess {
    getBotToken: () => string;
}

export interface StartWebServerOptions {
    bot: Bot<SlushaContext>;
    memory: Memory;
    runtimeConfig: RuntimeConfigAccess;
}

export interface AvailableChat {
    id: number;
    title: string;
    username?: string;
    type: TgChat['type'];
}

export interface CurrentCharacterPayload {
    name: string;
    names: string[];
    description: string;
    scenario: string;
    systemPrompt: string;
    postHistoryInstructions: string;
    firstMessage: string;
    messageExample: string;
}

export interface ChatInternalsPayload {
    summary: string;
    personalNotes: string;
}

export interface UsageWindowStatusPayload {
    tier: 'free' | 'trusted';
    downgraded: boolean;
    userUsed: number;
    userMax: number;
    userWindowMinutes: number;
    userBar: string;
    chatUsed: number;
    chatMax: number;
    chatWindowMinutes: number;
    chatBar: string;
}
