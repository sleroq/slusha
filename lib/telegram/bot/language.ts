import { Composer, InlineKeyboard } from 'grammy';
import logger from '../../logger.ts';
import { replyWithHTML } from '../helpers.ts';
import { SlushaContext } from '../setup-bot.ts';

const bot = new Composer<SlushaContext>();

type LocaleInfo = { code: string; label: string };

// Keep in sync with files in `locales/`
const AVAILABLE_LOCALES: LocaleInfo[] = [
    { code: 'en', label: 'English' },
    { code: 'ru', label: 'Русский' },
    { code: 'uk', label: 'Українська' },
    { code: 'pt', label: 'Português' },
    { code: 'hi', label: 'हिन्दी' },
    { code: 'id', label: 'Bahasa Indonesia' },
];

function buildLanguageKeyboard(
    currentLocale: string,
    userId: number,
) {
    const kb = new InlineKeyboard();
    const cols = 3;

    for (let i = 0; i < AVAILABLE_LOCALES.length; i++) {
        const { code, label } = AVAILABLE_LOCALES[i];
        const isCurrent = code === currentLocale;
        const text = (isCurrent ? '✅ ' : '') + label;
        kb.text(text, `set-lang ${code} ${userId}`);

        const endOfRow = i % cols === cols - 1;
        if (endOfRow && i !== AVAILABLE_LOCALES.length - 1) {
            kb.row();
        }
    }

    return kb;
}

bot.command('language', async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return;

    const memLocale = ctx.m.getChat().locale;
    const current = memLocale ?? await ctx.i18n.getLocale();
    const keyboard = buildLanguageKeyboard(current, userId);

    return replyWithHTML(ctx, ctx.t('language-specify-locale'), {
        reply_markup: keyboard,
        link_preview_options: { is_disabled: true },
    });
});

bot.callbackQuery(/set-lang .*/, async (ctx) => {
    try {
        const parts = ctx.callbackQuery.data.split(' ');
        const locale = parts[1];
        const ownerId = Number(parts[2]);

        if (!ctx.from || ownerId !== ctx.from.id) {
            return ctx.answerCallbackQuery(ctx.t('opt-out-not-your-button'));
        }

        const allowed = AVAILABLE_LOCALES.map((l) => l.code);
        if (!allowed.includes(locale)) {
            return ctx.answerCallbackQuery(ctx.t('language-invalid-locale'));
        }

        const current = ctx.m.getChat().locale ?? await ctx.i18n.getLocale();
        if (current === locale) {
            return ctx.answerCallbackQuery(ctx.t('language-already-set'));
        }

        // Persist in chat memory and use for current update
        ctx.m.getChat().locale = locale;
        await ctx.i18n.useLocale(locale);

        const keyboard = buildLanguageKeyboard(locale, ownerId);

        try {
            await ctx.editMessageText(ctx.t('language-language-set'), {
                reply_markup: keyboard,
                link_preview_options: { is_disabled: true },
            });
        } catch (error) {
            logger.error('Could not edit message: ', error);
        }

        return ctx.answerCallbackQuery();
    } catch (error) {
        logger.error('Error handling set-lang: ', error);
        return ctx.answerCallbackQuery('Error');
    }
});

export default bot;
