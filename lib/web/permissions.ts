import { Bot } from 'grammy';
import { UserConfig } from '../config.ts';
import { SlushaContext } from '../telegram/setup-bot.ts';

export type ConfigRole = 'viewer' | 'regular' | 'trusted' | 'admin';

export function resolveConfigRole(
    config: UserConfig,
    userId?: number,
): ConfigRole {
    if (!userId) return 'viewer';
    if (config.adminIds?.includes(userId)) return 'admin';
    if (config.trustedIds?.includes(userId)) return 'trusted';
    return 'regular';
}

export function canEditGlobalConfig(
    config: UserConfig,
    userId?: number,
): boolean {
    return resolveConfigRole(config, userId) === 'admin';
}

export async function canEditChatConfig(
    bot: Bot<SlushaContext>,
    chatId: number,
    userId?: number,
): Promise<boolean> {
    if (!userId) return false;

    if (chatId === userId) {
        return true;
    }

    try {
        const chat = await bot.api.getChat(chatId);
        if (chat.type === 'private') {
            return false;
        }

        const member = await bot.api.getChatMember(chatId, userId);
        return member.status === 'creator' || member.status === 'administrator';
    } catch {
        return false;
    }
}
