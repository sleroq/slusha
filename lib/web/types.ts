import { Bot } from 'grammy';
import type { Chat as TgChat } from 'grammy_types';
import type { DbClient } from '../db/client.ts';
import { SlushaContext } from '../telegram/setup-bot.ts';

export interface RuntimeConfigAccess {
    getBotToken: () => string;
}

export interface StartWebServerOptions {
    bot: Bot<SlushaContext>;
    db: DbClient;
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
