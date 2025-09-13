import { I18n } from '@grammyjs/i18n';
import { SlushaContext } from '../telegram/setup-bot.ts';

export function createI18n() {
    return new I18n({
        defaultLocale: 'ru',
        directory: 'locales',
    });
}

export function applyLocaleFromMemory() {
    return async (ctx: SlushaContext, next: () => Promise<void>) => {
        try {
            const memLocale = ctx.m?.getChat().locale;
            if (memLocale) {
                await ctx.i18n.useLocale(memLocale);
            }
        } catch (_) {
            // ignore
        }
        return next();
    };
}
