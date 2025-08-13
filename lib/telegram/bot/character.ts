import {
    Composer,
    GrammyError,
    InlineKeyboard,
    InlineQueryResultBuilder,
} from 'grammy';
import { SlushaContext } from '../setup-bot.ts';
import { getCharacter, getCharacters, pageSize } from '../../charhub/api.ts';
import { sliceMessage } from '../../helpers.ts';
import { ChatMemory } from '../../memory.ts';
import logger from '../../logger.ts';
import { InlineQueryResultArticle } from 'grammy_types';
import { generateText, Output } from 'ai';
import { google } from '@ai-sdk/google';
import { safetySettings } from '../../config.ts';
import z from 'zod';
import { limit } from 'grammy_ratelimiter';
import DOMPurify from 'isomorphic-dompurify';
import remarkHtml from 'remark-html';
import remarkParse from 'remark-parse';
import { unified } from 'unified';

const bot = new Composer<SlushaContext>();

bot.command('character', async (ctx) => {
    const textParts = ctx.msg.text.split(' ').map((arg) => arg.trim());

    let replyText = '';

    if (textParts.length > 1) {
        replyText +=
            'Тыкни на кнопку поиска чтобы найти персонажа, не нужно вводить в команду\n\n';
    }

    let keyboard = new InlineKeyboard()
        .switchInlineCurrent('Поиск', `@${ctx.chat.id} `);

    const character = ctx.m.getChat().character;

    const name = character?.name ?? 'Слюша';

    replyText = `${replyText}\n\nТекущий персонаж: ${name}.\n`;

    if (character) {
        keyboard = keyboard.text('Вернуть Слюшу', `set ${ctx.chat.id} default`);
        replyText += `Имена в чате: ${character.names.join(', ')}\n`;
    }

    replyText += `\nНайдите персонажа из Chub.ai чтобы установить его в чат`;

    // Reply with search button
    await ctx.reply(
        replyText,
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
            description:
                'Подсказка: добавь /nsfw в запрос, чтобы включить nsfw результаты',
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
    let query = args.join(' ');

    const findNsfwArg = query.match(/\s?\/nsfw\s?/i);
    let excludeNsfw = true;
    if (findNsfwArg) {
        query = query.replace(/\s?\/nsfw\s?/i, ' ').trim();
        excludeNsfw = false;
    }

    logger.info(
        `Query: ${query}`,
        `Page: ${page}, excludeNsfw: ${excludeNsfw}`,
    );

    let characters;
    try {
        characters = await getCharacters(query, page, excludeNsfw);
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

    const tagsWhitelist = [
        'b',
        'i',
        'u',
        's',
        'del',
        'strike',
        'span',
        'a',
        'code',
    ];

    for (const character of characters) {
        const url = `https://venus.chub.ai/characters/${character.fullPath}`;

        const baseHTMLName = await unified()
            .use(remarkParse)
            .use(remarkHtml)
            .process(character.name);

        const noHTMLName = DOMPurify.sanitize(character.name, {
            ALLOWED_TAGS: [],
        });
        const HTMLName = DOMPurify.sanitize(
            baseHTMLName,
            {
                ALLOWED_TAGS: tagsWhitelist,
            },
        );

        const descriptionCut = sliceMessage(
            character.description,
            3500,
        );
        const baseDescription = await unified()
            .use(remarkParse)
            .use(remarkHtml)
            .process(descriptionCut);

        const noHTMLDescription = DOMPurify.sanitize(baseDescription, {
            ALLOWED_TAGS: [],
        });

        const HTMLdescription = DOMPurify.sanitize(
            baseDescription,
            {
                ALLOWED_TAGS: tagsWhitelist,
            },
        );

        const topics = DOMPurify.sanitize(character.topics.join(', '), {
            ALLOWED_TAGS: [],
        });
        const starCount = character.starCount;

        let text = `${HTMLName}\n`;
        text += `<blockquote expandable>${HTMLdescription}</blockquote>` +
            `<a href="${character.avatar_url}"> </a>` +
            '\n';
        text += topics + '\n\n';
        text += ` <a href="${url}">${starCount}</a> ⭐`;

        const keyboard = new InlineKeyboard()
            .switchInlineCurrent('Поиск', `@${chatId} `)
            .text('Установить', `set ${chatId} ${character.id}`);

        const result = InlineQueryResultBuilder
            .article(
                String(character.id),
                noHTMLName,
                {
                    description: noHTMLDescription,
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

// Rate limit callback queries
bot.use(limit(
    {
        timeFrame: 10000,
        limit: 1,

        onLimitExceeded: async (ctx) => {
            await ctx.answerCallbackQuery('Слишком часто');
        },

        keyGenerator: (ctx) => {
            if (
                !(ctx.callbackQuery?.data?.startsWith('set') &&
                    !ctx.callbackQuery.data.endsWith('default'))
            ) {
                return;
            }

            if (ctx.hasChatType(['group', 'supergroup'])) {
                return ctx.chat.id.toString();
            }

            return ctx.from?.id.toString();
        },
    },
));

bot.callbackQuery(/set.*/, async (ctx) => {
    const args = ctx.callbackQuery.data.split(' ').map((arg) => arg.trim());
    if (args.length !== 3) {
        return;
    }

    const chatId = parseInt(args[1]);
    const chat = ctx.memory.chats[chatId];
    if (isNaN(chatId) || chat === undefined) {
        return ctx.answerCallbackQuery('Invalid chat id');
    }

    const userInChat = chat.members.find((member) => member.id === ctx.from.id);
    if (!userInChat) {
        return ctx.answerCallbackQuery('You are not a member of this chat');
    }

    // Manually set chat by query id cause it's not available in ctx
    ctx.m = new ChatMemory(ctx.memory, chat.info);

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

    const keyboardProgress = new InlineKeyboard()
        .switchInlineCurrent('Поиск', `@${chatId} `)
        .text('Скачиваю...', `progress set ${chatId} ${characterId}`);

    try {
        await ctx.editMessageReplyMarkup(
            {
                reply_markup: keyboardProgress,
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

    let character;
    try {
        character = await getCharacter(characterId);
    } catch (error) {
        logger.error('Could not get character: ', error);
        return ctx.answerCallbackQuery('Could not get character');
    }

    const config = ctx.info.config;
    const model = chat.chatModel ?? config.model;

    let namesResult;
    try {
        namesResult = await generateText({
            model: google(model, { safetySettings }),
            experimental_output: Output.object({
                schema: z.array(z.string()),
            }),
            temperature: config.temperature,
            topK: config.topK,
            topP: config.topP,
            prompt:
                `Напиши варианты имени "${character.name}", которые пользователи могут использовать в качестве обращения к этому персонажу. ` +
                'Варианты должны быть на русском, английском, уменьшительно ласкательные и очевидные похожие формы.\n' +
                'Пример: имя "Cute Slusha". Варианты: ["Cute Slusha", "Slusha", "Слюша", "слюшаня", "слюшка", "шлюша", "слюш"]\n' +
                'Пример: имя "Георгий". Варианты: ["Георгий", "Georgie", "George", "Geordie", "Geo", "Егор", "Герасим", "Жора", "Жорка", "Жорочка", "Гоша", "Гошенька", "Гера", "Герочка", "Гога"]',
            experimental_telemetry: {
                isEnabled: true,
                functionId: 'character-names',
                metadata: {
                    sessionId: chatId,
                    tags: ['character'],
                },
            },
        });
    } catch (error) {
        logger.error(error, 'Error getting names for character');
        return await ctx.reply(
            'Ошибка при получении имен для персонажа. Попробуйте снова',
        );
    }

    const names = namesResult.experimental_output as Array<string>;
    chat.character = { ...character, names };

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
            `${ctx.from.first_name} установил персонажа ${character.name}.\n` +
                `Имена в чате: ${chat.character.names.join(', ')}` +
                '\n\nМожет иметь смысл стереть память (/lobotomy), если это мешает новому персонажу.',
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
