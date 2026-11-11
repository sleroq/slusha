import { asc, desc, eq } from 'drizzle-orm';
import { GrammyError } from 'grammy';
import type { Update } from 'grammy/types';
import type { Db } from '../db/client';
import { updates } from '../db/schema';
import { callbackChatId } from './character';
import { imageFile } from './messages';

// Telegram may randomize the next update ID after a week without updates.
const offsetIdleMs = 6 * 24 * 60 * 60 * 1000;

export interface IngestionApi {
    getUpdates(options?: { offset?: number; timeout?: number; allowed_updates?: ('message' | 'edited_message' | 'message_reaction' | 'callback_query' | 'inline_query')[] }, signal?: AbortSignal): Promise<Update[]>;
}

interface IngestionOptions {
    db: Db;
    api: IngestionApi;
    processUpdate(update: Update, context: { deferReply: boolean }): Promise<void>;
    onError?(error: Error): void;
}

function lane(update: Update): string {
    const target = callbackChatId(update.callback_query?.data);
    if (target !== undefined) return `chat:${target}`;
    if (update.inline_query) return `inline:${update.inline_query.from.id}`;
    const chat = update.message?.chat ?? update.edited_message?.chat
        ?? update.message_reaction?.chat ?? update.callback_query?.message?.chat;
    if (chat) return `chat:${chat.id}`;
    return 'other';
}

function privateMessage(update: Update | undefined) {
    const message = update?.message;
    if (!message || message.chat.type !== 'private' || message.from?.is_bot) return false;
    const text = message.text ?? message.caption ?? '';
    return (text.length > 0 || imageFile(message) !== undefined) && !text.startsWith('/');
}

function retryDelay(error: unknown, delay: number) {
    if (error instanceof GrammyError && error.error_code === 429 && error.parameters.retry_after !== undefined) {
        return Math.max(delay, error.parameters.retry_after * 1000);
    }
    return delay;
}

function wait(ms: number, signal: AbortSignal): Promise<void> {
    if (signal.aborted) return Promise.resolve();
    return new Promise((resolve) => {
        function finish() {
            clearTimeout(timer);
            signal.removeEventListener('abort', finish);
            resolve();
        }
        const timer = setTimeout(finish, ms);
        signal.addEventListener('abort', finish, { once: true });
    });
}

export function createIngestion({ db, api, processUpdate, onError }: IngestionOptions) {
    const queues = new Map<string, Update[]>();
    const workers = new Set<Promise<void>>();
    let controller: AbortController | undefined;
    let startup: Promise<void> | undefined;
    let polling: Promise<void> | undefined;

    function schedule(update: Update, signal: AbortSignal) {
        const key = lane(update);
        const existing = queues.get(key);
        if (existing) {
            existing.push(update);
            return;
        }
        const queue = [update];
        queues.set(key, queue);
        const worker = Promise.resolve().then(async () => {
            while (queue.length && !signal.aborted) {
                const current = queue[0];
                let delay = 250;
                while (!signal.aborted) {
                    try {
                        await processUpdate(current, { deferReply: privateMessage(current) && privateMessage(queue[1]) });
                        await db.update(updates).set({ status: 'done' }).where(eq(updates.id, current.update_id));
                        queue.shift();
                        break;
                    } catch (error) {
                        if (error instanceof Error) onError?.(error);
                        else onError?.(new Error(String(error)));
                        await wait(retryDelay(error, delay), signal);
                        delay = Math.min(delay * 2, 30_000);
                    }
                }
            }
            queues.delete(key);
        });
        workers.add(worker);
        void worker.finally(() => workers.delete(worker));
    }

    async function poll(offset: number | undefined, lastReceivedAt: number | undefined, signal: AbortSignal) {
        let delay = 250;
        while (!signal.aborted) {
            try {
                if (lastReceivedAt !== undefined && Date.now() - lastReceivedAt >= offsetIdleMs) {
                    offset = undefined;
                    lastReceivedAt = undefined;
                }
                const received = await api.getUpdates({
                    offset, timeout: 30,
                    allowed_updates: ['message', 'edited_message', 'message_reaction', 'callback_query', 'inline_query'],
                }, signal);
                if (!received.length) continue;
                const inserted = await db.insert(updates).values(received.map((update) => ({ id: update.update_id, payload: update, status: 'pending' })))
                    .onConflictDoNothing().returning({ id: updates.id });
                const insertedIds = new Set(inserted.map((row) => row.id));
                received.sort((a, b) => a.update_id - b.update_id);
                for (const update of received) {
                    if (insertedIds.delete(update.update_id)) schedule(update, signal);
                }
                offset = Math.max(offset ?? 0, ...received.map((update) => update.update_id + 1));
                lastReceivedAt = Date.now();
                delay = 250;
            } catch (error) {
                if (signal.aborted) break;
                if (error instanceof Error) onError?.(error);
                else onError?.(new Error(String(error)));
                await wait(retryDelay(error, delay), signal);
                delay = Math.min(delay * 2, 30_000);
            }
        }
    }

    function start(): Promise<void> {
        if (startup) return startup;
        controller = new AbortController();
        const signal = controller.signal;
        startup = (async () => {
            const pending = await db.select().from(updates).where(eq(updates.status, 'pending')).orderBy(asc(updates.receivedAt), asc(updates.id));
            const [latest] = await db.select({ id: updates.id, receivedAt: updates.receivedAt }).from(updates).orderBy(desc(updates.receivedAt), desc(updates.id)).limit(1);
            if (signal.aborted) return;
            for (const row of pending) {
                // SAFETY: The updates table contains Telegram payloads written by ingestion.
                schedule(row.payload as Update, signal);
            }
            polling = poll(latest && latest.id + 1, latest?.receivedAt?.getTime(), signal);
        })();
        return startup;
    }

    async function stop(): Promise<void> {
        if (!controller) return;
        controller.abort();
        try {
            await startup;
            await polling;
            await Promise.all(workers);
        } finally {
            controller = undefined;
            startup = undefined;
            polling = undefined;
        }
    }

    return { start, stop };
}
