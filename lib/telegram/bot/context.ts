import { SlushaContext } from '../setup-bot.ts';
import { replyWithMarkdown } from '../helpers.ts';
import { Composer } from 'grammy';

const bot = new Composer<SlushaContext>();

bot.command('context', (ctx) => {
    const textParts = ctx.msg.text.split(' ').map((arg) => arg.trim());
    const config = ctx.info.config;

    const currentValue = ctx.m.getChat().messagesToPass ??
        config.messagesToPass;

    if (textParts.length < 2) {
        return replyWithMarkdown(
            ctx,
            'Передай количество сообщений, которое я буду помнить - `/context 16`\n\n' +
                'Маленькие значения дают более точные ответы, большие значения улучшают память. Максимум 200.\n' +
                `Текущее значение - ${currentValue}. Передай \`default\` чтобы вернуть количество сообщений по умолчанию (сейчас ${config.messagesToPass}, но может меняться с обновлениями)`,
        );
    }

    if (textParts[1] === 'default') {
        ctx.m.getChat().messagesToPass = undefined;
        return replyWithMarkdown(
            ctx,
            `Количество сообщений установлено на значение по умолчанию (${config.messagesToPass})`,
        );
    }

    const count = parseInt(textParts[1]);
    if (isNaN(count)) {
        return ctx.reply('Не поняла количество сообщений');
    }

    if (count < 1 || count > 200) {
        return ctx.reply('Количество сообщений должно быть от 1 до 200');
    }

    ctx.m.getChat().messagesToPass = count;

    return ctx.reply(`Количество сообщений установлено на ${count}`);
});

export default bot;
