import { I18n } from '@grammyjs/i18n';
import { SlushaContext } from '../telegram/setup-bot.ts';

export function createI18n() {
    return new I18n({
        defaultLocale: 'ru',
        directory: 'locales',
    });
}

export function applyLocaleFromPersistence() {
    return async (ctx: SlushaContext, next: () => Promise<void>) => {
        try {
            const locale = ctx.chat
                ? (await ctx.chats.getChat(ctx.chat)).locale
                : undefined;
            if (locale) {
                await ctx.i18n.useLocale(locale);
            }
        } catch (_) {
            // ignore
        }
        return next();
    };
}
