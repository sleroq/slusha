import Logger from 'https://deno.land/x/logger@v1.1.1/logger.ts';
import { SlushaContext } from './setup-bot.ts';
import { Message } from 'https://deno.land/x/grammy_types@v3.14.0/message.ts';

export async function replyWithMarkdown<X>(
    ctx: SlushaContext,
    text: string,
    other?: X
) {
    let parts = [text];
    // If message is too long, split it into multiple messages
    if (text.length >= 3000) {
        parts = text.split('\n');
    }

    let res;
    for (const part of parts) {
        try {
            res = await ctx.reply(part, {
                // reply_to_message_id: ctx.msg?.message_id,
                ...other,
                parse_mode: 'Markdown',
            });
        } catch (_) { // Retry without markdown
            res = await ctx.reply(text, {
                // reply_to_message_id: ctx.msg?.message_id,
            });
        }
    }

    if (!res) {
        throw new Error('Could not reply to user for some reason');
    }

    return res;
}

// FIXME: This does not work because it's not long enough, some internal timeout
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
            logger.error('Could not send typing signal: ', error);
        }
    }

    void type();

    setTimeout(() => {
        controller.abort();
    }, 60 * 1000); // 1 minute timeout

    return controller;
}

export type ReplyMessage = Exclude<
    Message.CommonMessage['reply_to_message'],
    undefined
>;
