import Logger from 'https://deno.land/x/logger@v1.1.1/logger.ts';
import { SlushaContext } from './setup-bot.ts';

export async function replyWithMarkdown(ctx: SlushaContext, text: string) {
    let res;
    try {
        res = await ctx.reply(text, {
            // reply_to_message_id: ctx.msg?.message_id,
            parse_mode: 'Markdown',
        });
    } catch (_) { // Retry without markdown
        res = await ctx.reply(text, {
            // reply_to_message_id: ctx.msg?.message_id,
        });
    }
    return res;
}

export function doTyping(ctx: SlushaContext, logger: Logger) {
    const controller = new AbortController();

    async function type() {
        try {
            await ctx.replyWithChatAction('typing', {}, controller.signal);
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
