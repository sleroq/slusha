import {
    Composer,
    InlineKeyboard,
    InlineQueryResultBuilder,
} from 'https://deno.land/x/grammy@v1.30.0/mod.ts';
import { SlushaContext } from '../setup-bot.ts';
import { InlineQueryResultArticle } from 'https://deno.land/x/grammy_types@v3.14.0/inline.ts';
import { getCharacter, getCharacters } from '../../charhub/api.ts';
import { escapeHtml } from '../../helpers.ts';
import logger from '../../logger.ts';

const bot = new Composer<SlushaContext>();

bot.command('character', async (ctx) => {
    const textParts = ctx.msg.text.split(' ').map((arg) => arg.trim());

    let replyText = '';

    if (textParts.length > 1) {
        replyText +=
            'Тыкни на кнопку поиска чтобы найти персонажа, не нужно вводить в команду';
    }

    let keyboard = new InlineKeyboard()
        .switchInlineCurrent('Поиск', `@${ctx.chat.id} `);

    if (ctx.m.getChat().character) {
        keyboard = keyboard.text('Вернуть Слюшу', `set ${ctx.chat.id} default`);
    }

    const character = ctx.m.getChat().character?.name ?? 'Слюша';

    // Reply with search button
    await ctx.reply(
        `${replyText}\n\nТекущий персонаж: ${character}.\n\nНайдите персонажа из Chub.ai чтобы установить его в чат`,
        { reply_markup: keyboard },
    );
});

bot.inlineQuery(/.*/, async (ctx) => {
    // TODO: Check if user is admin
    const args = ctx.inlineQuery.query
        .split(' ')
        .map((arg) => arg.trim())
        .filter((arg) => arg !== '');

    const chatId = parseInt(args[0]?.replace('@', ''));
    if (isNaN(chatId)) {
        const errorResult = InlineQueryResultBuilder
            .article('696969', 'Поиск по имени персонажа в Chub.ai', {
                description:
                    'Необходимо указать чат. Используйте команду /character',
            })
            .text(
                'Для информации о поиске персонажа используйте команду /character',
            );

        return ctx.answerInlineQuery([errorResult], { cache_time: 0 });
    }

    // from 2nd arg to the end
    const query = args.slice(1).join(' ');
    logger.info(`Query: ${query}`);

    // TODO: Pagination
    let characters;
    try {
        characters = await getCharacters(query);
    } catch (error) {
        logger.error('Could not get characters: ', error);

        const errorResult = InlineQueryResultBuilder
            .article('696969', 'Поиск по имени персонажа в Chub.ai', {
                description: 'Ошибка при поиске персонажа, попробуйте еще раз',
            })
            .text('Ошибка при поиске персонажа');

        return ctx.answerInlineQuery([errorResult], { cache_time: 0 });
    }

    const results: InlineQueryResultArticle[] = [];

    const header = InlineQueryResultBuilder
        .article('696969', 'Поиск по имени персонажа в Chub.ai')
        .text('https://venus.chub.ai/characters');

    results.push(header);

    for (const character of characters) {
        const url = `https://venus.chub.ai/characters/${character.fullPath}`;

        const name = escapeHtml(character.name);
        const description = escapeHtml(character.description);
        const topics = escapeHtml(character.topics.join(', '));
        const starCount = character.starCount;

        let text =
            `${name}<a href="${character.avatar_url}"> </a> <a href="${url}">(source)</a>\n`;
        text += description + '\n\n';
        text += topics + '\n\n';
        text += starCount + ' ⭐';

        const keyboard = new InlineKeyboard()
            .switchInlineCurrent('Поиск', `@${chatId} `)
            .text('Установить', `set ${chatId} ${character.id}`);

        const result = InlineQueryResultBuilder
            .article(
                character.id.toString(),
                character.name,
                {
                    description: character.description,
                    thumbnail_url: character.avatar_url,
                    reply_markup: keyboard,
                },
            )
            .text(
                text,
                {
                    parse_mode: 'HTML',
                },
            );

        results.push(result);
    }

    return ctx.answerInlineQuery(results);
});

bot.callbackQuery(/set.*/, async (ctx) => {
    const args = ctx.callbackQuery.data.split(' ').map((arg) => arg.trim());
    if (args.length !== 3) {
        return;
    }

    const chatId = parseInt(args[1]);
    if (isNaN(chatId)) {
        return ctx.answerCallbackQuery('Invalid chat id');
    }

    const chat = ctx.memory.chats[chatId];
    if (!chat) {
        return ctx.answerCallbackQuery('Chat not found');
    }

    if (args[2] === 'default') {
        chat.character = undefined;
        ctx.m.clear();
        return ctx.answerCallbackQuery('Установлена Слюша');
    }

    const characterId = parseInt(args[2]);
    if (isNaN(characterId)) {
        return ctx.answerCallbackQuery('Invalid character id');
    }

    let character;
    try {
        character = await getCharacter(characterId);
    } catch (error) {
        logger.error('Could not get character: ', error);
        return ctx.answerCallbackQuery('Could not get character');
    }

    chat.character = character;

    const keyboard = new InlineKeyboard()
        .text('Вернуть Слюшу', `set ${chatId} default`)
        .text('Установить повторно', `set ${chatId} ${characterId}`)
        .switchInlineCurrent('Поиск', `@${chatId} `);

    try {
        await ctx.editMessageReplyMarkup(
            {
                reply_markup: keyboard,
            },
        );
    } catch (error) {
        logger.error('Could not edit message: ', error);
    }

    const keyboard2 = new InlineKeyboard()
        .text('Вернуть Слюшу', `set ${chatId} default`)
        .switchInlineCurrent('Поиск', `@${chatId} `);

    try {
        await ctx.api.sendMessage(
            chatId,
            `${ctx.from.first_name} установил персонажа ${character.name}`,
            {
                reply_markup: keyboard2,
            },
        );
    } catch (error) {
        logger.error('Could not send message: ', error);
    }

    ctx.m.clear();

    return ctx.answerCallbackQuery('Character is set to ' + character.name);
});

export default bot;
