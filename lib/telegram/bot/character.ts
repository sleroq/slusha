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
import { generateObject, generateText } from 'ai';
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
        replyText += ctx.t('character-search-help');
    }

    let keyboard = new InlineKeyboard()
        .switchInlineCurrent(ctx.t('search'), `@${ctx.chat.id} `);

    const character = ctx.m.getChat().character;

    const name = character?.name ?? ctx.t('slusha-name');

    replyText = `${replyText}\n\n${ctx.t('character-current', { name })}\n`;

    if (character) {
        keyboard = keyboard.text(
            ctx.t('character-return-slusha'),
            `set ${ctx.chat.id} default`,
        );
        replyText += `${
            ctx.t('character-names-in-chat', {
                names: character.names.join(', '),
            })
        }\n`;
    }

    replyText += `\n${ctx.t('character-find-from-chub')}`;

    // Reply with search button
    await ctx.reply(
        replyText,
        { reply_markup: keyboard },
    );
});

function noChatIdErrorResult(ctx: SlushaContext) {
    return InlineQueryResultBuilder
        .article('696969', ctx.t('character-no-search'), {
            description: ctx.t('character-search-not-allowed'),
        })
        .text(ctx.t('character-open-search'));
}

function errorResult(chatId: number, ctx: SlushaContext) {
    return InlineQueryResultBuilder
        .article('696969', ctx.t('character-search-title'), {
            description: ctx.t('character-search-error'),
            reply_markup: new InlineKeyboard()
                .switchInlineCurrent(ctx.t('search'), `@${chatId} `),
        })
        .text(ctx.t('character-search-error-text'));
}

function headerResult(chatId: number, query: string, ctx: SlushaContext) {
    return InlineQueryResultBuilder
        .article('696969', ctx.t('character-search-title'), {
            description: ctx.t('character-nsfw-hint'),
            thumbnail_url: 'https://chub.ai/logo_cataract.png',
            reply_markup: new InlineKeyboard()
                .switchInlineCurrent(ctx.t('search'), `@${chatId} ${query}`),
        })
        .text(ctx.t('character-source-link'));
}

function notFoundResult(chatId: number, ctx: SlushaContext) {
    return InlineQueryResultBuilder
        .article(
            ctx.t('character-nothing-found'),
            ctx.t('character-try-different-search'),
            {
                description: ctx.t('character-nothing-found'),
                thumbnail_url:
                    'https://imgs.search.brave.com/g1uD8EeI5LKrOZlyrIsyEtHoHvDxV4TWWjSqjQSsndQ/rs:fit:860:0:0:0/g:ce/aHR0cHM6Ly9jZG4u/cGl4YWJheS5jb20v/cGhvdG8vMjAxNy8w/My8xMy8wNy8yOC9j/b21tdW5pY2F0aW9u/LTIxMzg5ODBfNjQw/LmpwZw',
                reply_markup: new InlineKeyboard()
                    .switchInlineCurrent(ctx.t('search'), `@${chatId} `),
            },
        )
        .text(ctx.t('character-nothing-found'));
}

bot.inlineQuery(/.*/, async (ctx) => {
    // TODO: Check if user is admin
    const args = ctx.inlineQuery.query
        .split(' ')
        .map((arg) => arg.trim())
        .filter((arg) => arg !== '');

    const chatId = parseInt(args[0]?.replace('@', ''));
    if (isNaN(chatId)) {
        return ctx.answerInlineQuery([noChatIdErrorResult(ctx)]);
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
        return ctx.answerInlineQuery([errorResult(chatId, ctx)], {
            cache_time: 0,
        });
    }

    const results: InlineQueryResultArticle[] = [];

    results.push(headerResult(chatId, query, ctx));

    if (characters.length === 0) {
        results.push(notFoundResult(chatId, ctx));
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
            .switchInlineCurrent(ctx.t('search'), `@${chatId} `)
            .text(ctx.t('character-set'), `set ${chatId} ${character.id}`);

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
                ctx.t('character-next-page'),
                `@${chatId} /p ${page + 1} ${query}`,
            );

        results.push(
            InlineQueryResultBuilder
                .article(
                    ctx.t('character-next-page'),
                    ctx.t('character-click-next-page'),
                    {
                        description: ctx.t('character-search-next-page'),
                        thumbnail_url:
                            'https://imgs.search.brave.com/6T6lo-oOr54SXQjAYk66hQUadauJQe69QkXl2EE-4Mw/rs:fit:860:0:0:0/g:ce/aHR0cHM6Ly9nZXRk/cmF3aW5ncy5jb20v/ZnJlZS1pY29uL25l/eHQtcGFnZS1pY29u/LTY3LnBuZw',
                        reply_markup: nextPageKeyboard,
                    },
                )
                .text(ctx.t('character-next-page')),
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
            await ctx.answerCallbackQuery(ctx.t('character-rate-limit'));
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
        return ctx.answerCallbackQuery(ctx.t('character-invalid-chat-id'));
    }

    const userInChat = chat.members.find((member) => member.id === ctx.from.id);
    if (!userInChat) {
        return ctx.answerCallbackQuery(ctx.t('character-not-member'));
    }

    // Manually set chat by query id cause it's not available in ctx
    ctx.m = new ChatMemory(ctx.memory, chat.info);

    if (!chat) {
        return ctx.answerCallbackQuery('Chat not found');
    }

    if (args[2] === 'default') {
        let slushaBackKeyboard = new InlineKeyboard()
            .switchInlineCurrent(ctx.t('search'), `@${chatId} `);

        if (chat.character === undefined) {
            return ctx.answerCallbackQuery(ctx.t('character-already-set'));
        } else {
            slushaBackKeyboard = new InlineKeyboard()
                .switchInlineCurrent(ctx.t('search'), `@${chatId} `)
                .text(
                    ctx.t('character-return-character', {
                        name: chat.character.name,
                    }),
                    `set ${chatId} ${chat.character.id}`,
                );
        }

        chat.character = undefined;

        try {
            await Promise.all([
                ctx.answerCallbackQuery(ctx.t('character-set-slusha')),
                ctx.api.sendMessage(
                    chatId,
                    ctx.t('character-user-returned-slusha', {
                        userName: ctx.from.first_name,
                    }),
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
        return ctx.answerCallbackQuery(ctx.t('character-invalid-id'));
    }

    if (chat.character?.id === characterId) {
        return ctx.answerCallbackQuery(ctx.t('character-already-exists'));
    }

    const keyboardProgress = new InlineKeyboard()
        .switchInlineCurrent(ctx.t('search'), `@${chatId} `)
        .text(
            ctx.t('character-downloading'),
            `progress set ${chatId} ${characterId}`,
        );

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
        return ctx.answerCallbackQuery(ctx.t('character-not-found'));
    }

    const config = ctx.info.config;
    // TODO: Allow to set different model for generating character names
    const model = chat.chatModel ?? config.model;

    const useJsonResponses = config.useJsonResponses;
    let names: string[] = [];
    try {
        if (useJsonResponses) {
            const result = await generateObject({
                model: google(model),
                providerOptions: { google: { safetySettings } },
                schema: z.array(z.string()),
                temperature: config.temperature,
                topK: config.topK,
                topP: config.topP,
                prompt:
                    `Напиши варианты имени "${character.name}", которые пользователи могут использовать в качестве обращения к этому персонажу. ` +
                    'Варианты должны быть на русском, английском, уменьшительно ласкательные и очевидные похожие формы.',
                experimental_telemetry: {
                    isEnabled: true,
                    functionId: 'character-names',
                    metadata: {
                        sessionId: chatId.toString(),
                        tags: ['character'],
                    },
                },
            });
            names = result.object;
        } else {
            const response = await generateText({
                model: google(model),
                providerOptions: { google: { safetySettings } },
                temperature: config.temperature,
                topK: config.topK,
                topP: config.topP,
                prompt:
                    `Напиши варианты имени "${character.name}" (русские и английские, уменьшительные и очевидные похожие формы). ` +
                    'Верни только список вариантов через запятую или с новой строки, без пояснений.',
                experimental_telemetry: {
                    isEnabled: true,
                    functionId: 'character-names-dumb',
                    metadata: {
                        sessionId: chatId.toString(),
                        tags: ['character'],
                    },
                },
            });

            const raw = response.text.trim();
            const split = raw
                .split(/\n|,|;|•|·|\u2022/g)
                .map((s) => s.trim())
                .map((s) => s.replace(/^[-*•·]\s*/, ''))
                .map((s) => s.replace(/^"|"$/g, ''))
                .filter((s) => s.length > 0 && s.length < 64);

            const dedup = new Set<string>();
            for (const s of split) {
                const k = s.toLowerCase();
                if (!dedup.has(k)) dedup.add(k);
            }
            names = Array.from(dedup).map((k) => {
                // Recover original casing by finding first occurrence in split
                const orig = split.find((s) => s.toLowerCase() === k);
                return orig ?? k;
            });

            if (names.length === 0) {
                names = [character.name];
            }
            if (names.length > 20) {
                names = names.slice(0, 20);
            }
        }
    } catch (error) {
        logger.error(error, 'Error getting names for character');
        return await ctx.reply(ctx.t('character-names-error'));
    }

    chat.character = { ...character, names };

    const keyboard = new InlineKeyboard()
        .text(ctx.t('character-return-slusha'), `set ${chatId} default`)
        .text(ctx.t('character-set-again'), `set ${chatId} ${characterId}`)
        .switchInlineCurrent(ctx.t('search'), `@${chatId} `);

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
        .text(ctx.t('character-return-slusha'), `set ${chatId} default`)
        .switchInlineCurrent(ctx.t('search'), `@${chatId} `);

    try {
        await ctx.api.sendMessage(
            chatId,
            ctx.t('character-set-success', {
                userName: ctx.from.first_name,
                characterName: character.name,
                names: chat.character.names.join(', '),
            }),
            {
                reply_markup: keyboard2,
            },
        );
    } catch (error) {
        logger.error('Could not send message: ', error);
    }

    ctx.m.clear();

    return ctx.answerCallbackQuery(
        ctx.t('character-set-to', { name: character.name }),
    );
});

export default bot;
