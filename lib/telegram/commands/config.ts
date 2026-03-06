import { Composer, InlineKeyboard } from 'grammy';
import { SlushaContext } from '../setup-bot.ts';
import { Config } from '../../config.ts';

function widgetUrl(scope: 'global' | 'chat', chatId: number): string {
    const base = Deno.env.get('WIDGET_BASE_URL');
    if (!base) {
        throw new Error('WIDGET_BASE_URL is not configured');
    }

    const url = new URL('/widget/', base);
    url.searchParams.set('scope', scope);
    url.searchParams.set('chatId', chatId.toString());
    return url.toString();
}

function mainMiniAppUrl(username: string, startParam: string): string {
    const url = new URL(`https://t.me/${username}`);
    url.searchParams.set('startapp', startParam);
    return url.toString();
}

export function registerConfig(
    composer: Composer<SlushaContext>,
    config: Config,
) {
    composer.command('config', async (ctx) => {
        const args = ctx.msg.text
            .split(' ')
            .map((arg) => arg.trim())
            .filter((arg) => arg !== '');

        const requestedScope = args[1] === 'global' ? 'global' : 'chat';
        let targetChatId = ctx.chat.id;

        if (requestedScope === 'chat' && ctx.chat.type === 'private') {
            const maybeChatId = Number(args[1]);
            if (Number.isFinite(maybeChatId)) {
                targetChatId = maybeChatId;
            }
        }

        if (requestedScope === 'global') {
            if (!ctx.from || !(config.adminIds?.includes(ctx.from.id) ?? false)) {
                return ctx.reply(ctx.t('admin-only'));
            }
        } else if (ctx.chat.type !== 'private') {
            const admins = await ctx.getChatAdministrators();
            if (!admins.some((a) => a.user.id === ctx.from?.id)) {
                return ctx.reply(ctx.t('context-admin-only'));
            }

            const deepLink = ctx.me.username
                ? mainMiniAppUrl(ctx.me.username, `config_${ctx.chat.id}`)
                : undefined;

            if (deepLink) {
                return ctx.reply(
                    'Open chat config mini app:',
                    {
                        reply_markup: new InlineKeyboard().url(
                            ctx.t('config-open-widget'),
                            deepLink,
                        ),
                        link_preview_options: {
                            is_disabled: true,
                        },
                    },
                );
            }

            return ctx.reply(
                'Web App buttons are only supported in private chat. Open bot PM and run:\n' +
                    `\`/config ${ctx.chat.id}\``,
                { parse_mode: 'Markdown' },
            );
        }

        let url: string;
        try {
            url = widgetUrl(requestedScope, targetChatId);
        } catch {
            return ctx.reply(ctx.t('config-widget-unavailable'));
        }

        const kb = new InlineKeyboard().webApp(ctx.t('config-open-widget'), url);
        const msg = requestedScope === 'global'
            ? ctx.t('config-open-global')
            : ctx.t('config-open-chat');

        return ctx.reply(`${msg}\n\n${url}`, {
            reply_markup: kb,
            link_preview_options: {
                is_disabled: true,
            },
        });
    });
}
