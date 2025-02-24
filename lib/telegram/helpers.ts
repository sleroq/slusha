import { Logger } from '@deno-library/logger';
import { SlushaContext } from './setup-bot.ts';
import { Message, ParseMode } from 'grammy_types';

// Thanks cloud sonnet for this function hopefully it works
function splitMessage(message: string, maxLength = 3000) {
    // Input validation
    if (!message || typeof message !== 'string') {
        throw new Error('Message must be a non-empty string');
    }
    if (maxLength <= 0) {
        throw new Error('Max length must be positive');
    }

    const parts = [];
    let currentIndex = 0;

    while (currentIndex < message.length) {
        let endIndex = currentIndex + maxLength;

        // If we're not at the end of the message
        if (endIndex < message.length) {
            // Look for the last space within the limit
            const lastSpace = message.lastIndexOf(' ', endIndex);

            // If we found a space within the limit, break at the space
            if (lastSpace > currentIndex) {
                endIndex = lastSpace;
            }
            // If no space found, force break at maxLength
        }

        // Extract the part and trim whitespace
        const part = message.slice(currentIndex, endIndex).trim();

        // Only add non-empty parts
        if (part) {
            parts.push(part);
        }

        // Move to next chunk
        currentIndex = endIndex + 1;
    }

    return parts;
}

async function replyGeneric<Other>(
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

    async function type() {
        try {
            await ctx.replyWithChatAction(
                'typing',
                undefined,
                controller.signal,
            );
        } catch (error) {
            logger.debug('Could not send typing signal: ', error);
        }
    }

    let isTyping = true;

    void type();
    const typingInterval = setInterval(() => void type(), 1000);

    function stop() {
        clearInterval(typingInterval);
        controller.abort();
        isTyping = false;
    }

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
