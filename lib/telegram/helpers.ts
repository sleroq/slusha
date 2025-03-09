import { Logger } from '@deno-library/logger';
import { SlushaContext } from './setup-bot.ts';
import { Message, ParseMode } from 'grammy_types';
import { splitMessage } from '../helpers.ts';

export async function replyGeneric<Other>(
    ctx: SlushaContext,
    text: string,
    reply: boolean,
    parse_mode: ParseMode,
    other?: Other,
) {
    let parts = [text];
    // If message is too long, split it into multiple messages
    if (text.length >= 3000) {
        // split by 3000 symbols
        parts = splitMessage(text, 3000);
    }

    let res;
    for (const part of parts) {
        if (reply) {
            try {
                res = await ctx.reply(part, {
                    parse_mode,
                    reply_to_message_id: ctx.msg?.message_id,
                    ...other,
                });
            } catch (_) { // Retry without markdown
                res = await ctx.reply(text, {
                    reply_to_message_id: ctx.msg?.message_id,
                });
            }
        } else {
            try {
                res = await ctx.reply(part, {
                    parse_mode,
                    ...other,
                });
            } catch (_) { // Retry without markdown
                res = await ctx.reply(text);
            }
        }
    }

    if (!res) {
        throw new Error('Could not reply to user for some reason');
    }

    return res;
}

async function replyGenericId<Other>(
    ctx: SlushaContext,
    text: string,
    id: number | undefined,
    parse_mode: ParseMode,
    other?: Other,
) {
    let parts = [text];
    // If message is too long, split it into multiple messages
    if (text.length >= 3000) {
        // split by 3000 symbols
        parts = splitMessage(text, 3000);
    }

    let res;
    for (const part of parts) {
        if (id) {
            try {
                res = await ctx.reply(part, {
                    parse_mode,
                    reply_to_message_id: id,
                    ...other,
                });
            } catch (_) { // Retry without markdown
                res = await ctx.reply(text, {
                    reply_to_message_id: id,
                });
            }
        } else {
            try {
                res = await ctx.reply(part, {
                    parse_mode,
                    reply_to_message_id: ctx.msg?.message_id,
                    ...other,
                });
            } catch (_) { // Retry without markdown
                res = await ctx.reply(text, {
                    reply_to_message_id: ctx.msg?.message_id,
                });
            }
        }
    }

    if (!res) {
        throw new Error('Could not reply to user for some reason');
    }

    return res;
}

export function replyWithHTML<Other>(
    ctx: SlushaContext,
    text: string,
    other?: Other,
) {
    return replyGeneric(ctx, text, true, 'HTML', other);
}

export function replyWithMarkdown<Other>(
    ctx: SlushaContext,
    text: string,
    other?: Other,
) {
    return replyGeneric(ctx, text, true, 'Markdown', other);
}

export function replyWithMarkdownId<Other>(
    ctx: SlushaContext,
    text: string,
    id: number | undefined,
    other?: Other,
) {
    return replyGenericId(ctx, text, id, 'Markdown', other);
}

export function doTyping(ctx: SlushaContext, logger: Logger) {
    const controller = new AbortController();
    let errorCount = 0;

    let isTyping = true;

    const typingInterval = setInterval(() => void type(), 1000);

    function stop() {
        clearInterval(typingInterval);
        controller.abort();
        isTyping = false;
    }

    async function type() {
        try {
            await ctx.replyWithChatAction(
                'typing',
                undefined,
                controller.signal,
            );
        } catch (_) {
            errorCount++;
            if (errorCount > 5) {
                stop();
            }
            logger.debug('Could not send typing signal');
        }
    }

    void type();

    // Stop after 1 minute
    setTimeout(() => {
        if (!isTyping) {
            return;
        }

        logger.info('Stopping typing after 1 minute (something went wrong)');
        stop();
    }, 60 * 1000);

    return { abort: stop };
}

export type ReplyMessage = Exclude<
    Message.CommonMessage['reply_to_message'],
    undefined
>;
