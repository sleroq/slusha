import { Composer } from 'https://deno.land/x/grammy@v1.30.0/composer.ts';
import { SlushaContext } from '../setup-bot.ts';
import { InlineKeyboard } from 'https://deno.land/x/grammy@v1.30.0/convenience/keyboard.ts';
import { OptOutUser } from '../../memory.ts';
import { replyWithHTML } from '../helpers.ts';
import logger from '../../logger.ts';

const bot = new Composer<SlushaContext>();

function formatOptOutUsers(users: OptOutUser[]) {
    let message = '\n\n Пользователи, которых не видит слюша:\n';

    message += users.map((u) => {
        if (u.username) {
            return `<a href="https://t.me/${u.username}">${u.first_name}</a>`;
        } else {
            return u.first_name;
        }
    }).join('\n');

    return message;
}

bot.command('optout', (ctx) => {
    if (!ctx.from) {
        return;
    }

    let message =
        '<b>Слюша больше не будет видеть твои сообщения в этом чате.</b>\n' +
        '<span class="tg-spoiler">за исключением прямого ответа другого пользователя на твое сообщение с упоминанием слюши</span>';

    const optOutUsers = ctx.m.getChat().optOutUsers;

    if (!optOutUsers.find((u) => u.id === ctx.from?.id)) {
        optOutUsers.push({
            id: ctx.from.id,
            first_name: ctx.from.first_name,
            username: ctx.from.username,
        });
    }

    if (optOutUsers.length > 1) {
        message += formatOptOutUsers(optOutUsers);
    }

    return replyWithHTML(ctx, message, {
        reply_markup: new InlineKeyboard().text('Вернуться', 'opt-in'),
        link_preview_options: {
            is_disabled: true,
        },
    });
});
bot.callbackQuery('opt-in', (ctx) => {
    return optIn(ctx, ctx.callbackQuery.from.id, false);
});

bot.command('optin', (ctx) => {
    const id = ctx.from?.id;
    if (!id) {
        return;
    }

    return optIn(ctx, id, true);
});

async function optIn(ctx: SlushaContext, id: number, reply: boolean) {
    const wasOptedIn = ctx.m.getChat().optOutUsers.find((u) => u.id === id);
    const verb = wasOptedIn ? 'уже' : 'снова';
    let message = `Ура, Слюша ${verb} видит твои сообщения`;

    ctx.m.getChat().optOutUsers = ctx.m.getChat().optOutUsers.filter((u) =>
        u.id !== id
    );

    if (ctx.m.getChat().optOutUsers.length > 1) {
        message += formatOptOutUsers(ctx.m.getChat().optOutUsers);
    }

    if (reply) {
        return replyWithHTML(ctx, message, {
            link_preview_options: {
                is_disabled: true,
            },
        });
    }

    try {
        await ctx.editMessageText(message, {
            parse_mode: 'HTML',
            link_preview_options: {
                is_disabled: true,
            },
        });
    } catch (error) {
        try {
            await ctx.editMessageText(message);
        } catch (error) {
            logger.error('Could not edit message: ', error);
        }
    }
}

export default bot;
