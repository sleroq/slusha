import { eq } from 'drizzle-orm';
import { GrammyError, type Api } from 'grammy';
import type { Db } from '../db/client';
import { chats } from '../db/schema';

export class PermanentTelegramError extends Error {
    constructor(public readonly telegramError: GrammyError) {
        super(telegramError.message, { cause: telegramError });
    }
}

function lostRights(error: GrammyError) {
    return error.error_code === 403 || (error.error_code === 400 && error.description.toLowerCase().includes('not enough rights to send text messages'));
}

function permanent(error: GrammyError) {
    const description = error.description.toLowerCase();
    return lostRights(error) || (error.error_code === 400 && (description.includes('message to be replied not found') || description.includes('chat not found')));
}

export function createTelegramDelivery(db: Db, api: Api) {
    async function send(chatId: number, text: string, options?: Parameters<Api['sendMessage']>[2]) {
        try {
            return await api.sendMessage(chatId, text, options);
        } catch (error) {
            if (!(error instanceof GrammyError) || !permanent(error)) throw error;
            if (lostRights(error)) await db.update(chats).set({ sendBlocked: true }).where(eq(chats.id, chatId));
            throw new PermanentTelegramError(error);
        }
    }

    async function canSend(chatId: number, topicId: number) {
        const [chat] = await db.select({ sendBlocked: chats.sendBlocked }).from(chats).where(eq(chats.id, chatId));
        if (!chat?.sendBlocked) return true;
        const options: Parameters<Api['sendMessage']>[2] = {};
        if (topicId) options.message_thread_id = topicId;
        let probe: Awaited<ReturnType<Api['sendMessage']>>;
        try {
            probe = await send(chatId, 'Checking rights', options);
        } catch (error) {
            if (error instanceof PermanentTelegramError && lostRights(error.telegramError)) return false;
            throw error;
        }
        await db.update(chats).set({ sendBlocked: false }).where(eq(chats.id, chatId));
        try {
            await api.deleteMessage(chatId, probe.message_id);
        } catch (error) {
            console.error('Could not delete Telegram rights probe', error);
        }
        return true;
    }

    async function getChatMember(chatId: number, userId: number) {
        try {
            return await api.getChatMember(chatId, userId);
        } catch (error) {
            if (error instanceof GrammyError && (error.error_code === 400 || error.error_code === 403)) throw new PermanentTelegramError(error);
            throw error;
        }
    }

    return { send, canSend, getChatMember };
}
