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

