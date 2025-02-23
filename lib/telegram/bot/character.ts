import {
    Composer,
    GrammyError,
    InlineKeyboard,
    InlineQueryResultBuilder,
} from 'grammy';
import { SlushaContext } from '../setup-bot.ts';
import { getCharacter, getCharacters, pageSize } from '../../charhub/api.ts';
import { escapeHtml } from '../../helpers.ts';
import { ChatMemory } from '../../memory.ts';
import logger from '../../logger.ts';
import { InlineQueryResultArticle } from 'grammy_types';

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

const noChatIdErrorResult = InlineQueryResultBuilder
    .article('696969', 'Нет поиска', {
        description: 'Так просто искать нельзя, используй команду /character',
    })
    .text(
        'Открой поиск через команду /character',
    );

function errorResult(chatId: number) {
    return InlineQueryResultBuilder
        .article('696969', 'Поиск по имени персонажа в Chub.ai', {
            description: 'Ошибка при поиске персонажа, попробуйте еще раз',
            reply_markup: new InlineKeyboard()
                .switchInlineCurrent('Поиск', `@${chatId} `),
        })
        .text('Ошибка при поиске персонажа');
}

function headerResult(chatId: number, query: string) {
    return InlineQueryResultBuilder
        .article('696969', 'Поиск по имени персонажа в Chub.ai', {
            description: 'Результаты:',
            thumbnail_url: 'https://chub.ai/logo_cataract.png',
            reply_markup: new InlineKeyboard()
                .switchInlineCurrent('Поиск', `@${chatId} ${query}`),
        })
        .text('Персонажи отсюда: https://venus.chub.ai/characters');
}

function notFoundResult(chatId: number) {
    return InlineQueryResultBuilder
        .article(
            'Ничего не найдено',
            'Попробуйте искать что-нибудь другое',
            {
                description: 'Ничего не найдено',
                thumbnail_url:
                    'https://imgs.search.brave.com/g1uD8EeI5LKrOZlyrIsyEtHoHvDxV4TWWjSqjQSsndQ/rs:fit:860:0:0:0/g:ce/aHR0cHM6Ly9jZG4u/cGl4YWJheS5jb20v/cGhvdG8vMjAxNy8w/My8xMy8wNy8yOC9j/b21tdW5pY2F0aW9u/LTIxMzg5ODBfNjQw/LmpwZw',
                reply_markup: new InlineKeyboard()
                    .switchInlineCurrent('Поиск', `@${chatId} `),
            },
        )
        .text('Ничего не найдено');
}

bot.inlineQuery(/.*/, async (ctx) => {
    // TODO: Check if user is admin
    const args = ctx.inlineQuery.query
        .split(' ')
        .map((arg) => arg.trim())
        .filter((arg) => arg !== '');

    const chatId = parseInt(args[0]?.replace('@', ''));
    if (isNaN(chatId)) {
        return ctx.answerInlineQuery([noChatIdErrorResult]);
    }
    args.splice(0, 1);

    const pageArgIndex = args.indexOf('/p');
    let page = 1;
    if (pageArgIndex !== -1) {
        const pageArg = args[pageArgIndex + 1];

        const pageParsed = parseInt(pageArg);
        if (isNaN(pageParsed)) {
            args.splice(pageArgIndex, 1);
        } else {
            page = pageParsed;
            args.splice(pageArgIndex, 2);
        }
    }

    // from 2nd arg to the end
    const query = args.join(' ');
    logger.info(`Query: ${query}`, `Page: ${page}`);

    let characters;
    try {
        characters = await getCharacters(query, page);
    } catch (error) {
        logger.error('Could not get characters: ', error);
        return ctx.answerInlineQuery([errorResult(chatId)], { cache_time: 0 });
    }

    const results: InlineQueryResultArticle[] = [];

    results.push(headerResult(chatId, query));

    if (characters.length === 0) {
        results.push(notFoundResult(chatId));
        return ctx.answerInlineQuery(results);
    }

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

    if (characters.length == pageSize) {
        const nextPageKeyboard = new InlineKeyboard()
            .switchInlineCurrent(
                'Следующая страница',
                `@${chatId} /p ${page + 1} ${query}`,
            );

        results.push(
            InlineQueryResultBuilder
                .article(
                    'Следующая страница',
                    'кликай чтобы открыть следующую страницу',
                    {
                        description: 'Поиск - Следующая страница',
                        thumbnail_url:
                            'https://imgs.search.brave.com/6T6lo-oOr54SXQjAYk66hQUadauJQe69QkXl2EE-4Mw/rs:fit:860:0:0:0/g:ce/aHR0cHM6Ly9nZXRk/cmF3aW5ncy5jb20v/ZnJlZS1pY29uL25l/eHQtcGFnZS1pY29u/LTY3LnBuZw',
                        reply_markup: nextPageKeyboard,
                    },
                )
                .text('Следующая страница'),
        );
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

    // Manually set chat by query id cause it's not available in ctx
    const chatInfo = ctx.memory.chats[chatId].info;
    ctx.m = new ChatMemory(ctx.memory, chatInfo);

    const chat = ctx.memory.chats[chatId];
    if (!chat) {
        return ctx.answerCallbackQuery('Chat not found');
    }

    if (args[2] === 'default') {
        let slushaBackKeyboard = new InlineKeyboard()
            .switchInlineCurrent('Поиск', `@${chatId} `);

        if (chat.character === undefined) {
            return ctx.answerCallbackQuery('Слюша уже стоит');
        } else {
            slushaBackKeyboard = new InlineKeyboard()
                .switchInlineCurrent('Поиск', `@${chatId} `)
                .text(
                    `Вернуть ${chat.character.name}`,
                    `set ${chatId} ${chat.character.id}`,
                );
        }

        chat.character = undefined;

        try {
            await Promise.all([
                ctx.answerCallbackQuery('Установлена Слюша'),
                ctx.api.sendMessage(
                    chatId,
                    `${ctx.from.first_name} вернул Слюшу`,
                    {
                        reply_markup: slushaBackKeyboard,
                    },
                ),
            ]);
        } catch (error) {
            logger.error('Could not notify character change: ', error);
        }

        ctx.m.clear();
    }

    const characterId = parseInt(args[2]);
    if (isNaN(characterId)) {
        return ctx.answerCallbackQuery('Invalid character id');
    }

    if (chat.character?.id === characterId) {
        return ctx.answerCallbackQuery('Этот персонаж уже установлен');
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
        // Ignore if message is not modified errors
        if (
            !(error instanceof GrammyError &&
                error.description.includes('message is not modified'))
        ) {
            logger.error('Could not edit message: ', error);
        }
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
