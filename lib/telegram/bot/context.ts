import { SlushaContext } from '../setup-bot.ts';
import { replyWithMarkdown } from '../helpers.ts';
import { Composer } from 'grammy';

const bot = new Composer<SlushaContext>();

bot.command('context', async (ctx) => {
    const textParts = ctx.msg.text.split(' ').map((arg) => arg.trim());
    const config = ctx.info.config;

    const currentValue = ctx.m.getChat().messagesToPass ??
        config.messagesToPass;

    if (textParts.length < 2) {
        return replyWithMarkdown(
            ctx,
            ctx.t('context-help', {
                currentValue,
                defaultValue: config.messagesToPass,
            }),
        );
    }

    if (ctx.chat.type !== 'private') {
        const admins = await ctx.getChatAdministrators();
        if (!admins.some((a) => a.user.id === ctx.from?.id)) {
            return ctx.reply(ctx.t('context-admin-only'));
        }
    }

    if (textParts[1] === 'default') {
        ctx.m.getChat().messagesToPass = undefined;
        return replyWithMarkdown(
            ctx,
            ctx.t('context-default-set', {
                defaultValue: config.messagesToPass,
            }),
        );
    }

    const count = parseInt(textParts[1]);
    if (isNaN(count)) {
        return ctx.reply(ctx.t('context-invalid-number'));
    }

    if (count < 1 || count > 200) {
        return ctx.reply(ctx.t('context-out-of-range'));
    }

    ctx.m.getChat().messagesToPass = count;

    let msg = ctx.t('context-set', { count });
    if (count > 60) {
        msg += '\n\n`TODO: запейволить большой контекст`';
    }

    return replyWithMarkdown(ctx, msg);
});

export default bot;
