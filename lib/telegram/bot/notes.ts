import { Composer } from 'https://deno.land/x/grammy@v1.30.0/composer.ts';
import { google } from 'npm:@ai-sdk/google';
import { CoreMessage, generateText } from 'npm:ai';
import { Config, safetySettings } from '../../config.ts';
import { fixAIResponse } from '../../helpers.ts';
import logger from '../../logger.ts';
import { SlushaContext } from '../setup-bot.ts';
import { makeHistory } from '../../history.ts';

export default function notes(config: Config, botId: number) {
    const bot = new Composer<SlushaContext>();

    // Generate summary about chat every 50 messages
    // if bot was used in last 3 days
    bot.on('message', async (ctx, next) => {
        // Skip for private chats
        if (ctx.msg.chat.type === 'private') {
            return next();
        }

        if (
            ctx.m.getChat().lastUse <
                (Date.now() - config.chatLastUseNotes * 24 * 60 * 60 * 1000)
        ) {
            return next();
        }

        // Skip if there are less than 20 messages in chat history
        if (ctx.m.getHistory().length < 20) {
            return next();
        }

        // Check if 50 messages from last notes
        if (
            ctx.m.getChat().lastNotes &&
            ctx.msg.message_id - ctx.m.getChat().lastNotes < 50
        ) {
            return next();
        }

        // Set last notes to prevent retries
        ctx.m.getChat().lastNotes = ctx.msg.message_id;

        const model = config.ai.notesModel ?? config.ai.model;

        // TODO: Make different function for notes history
        let context: CoreMessage[] = [];
        try {
            context = await makeHistory(
                { token: config.botToken, id: botId },
                ctx.api,
                logger,
                ctx.m.getHistory(),
                {
                    messagesLimit: 50,
                    symbolLimit: config.ai.messageMaxLength / 3,
                    images: false,
                },
            );
        } catch (error) {
            logger.error('Could not get history: ', error);
            return next();
        }

        let prompt = config.ai.prePrompt;
        const character = ctx.m.getChat().character;
        if (character) {
            prompt += character.description;
        } else {
            prompt += config.ai.prompt;
        }
        prompt += '\n' + config.ai.notesPrompt;

        const messages: CoreMessage[] = [
            {
                role: 'system',
                content: prompt,
            },
            ...context,
            {
                role: 'user',
                content: config.ai.notesPrompt,
            },
        ];

        const start = Date.now();

        let response;
        try {
            response = await generateText({
                model: google(model, {
                    safetySettings,
                }),
                messages,
                temperature: config.ai.temperature,
                topK: config.ai.topK,
                topP: config.ai.topP,
            });
        } catch (error) {
            logger.error('Could not get summary: ', error);
            return next();
        }

        const chatName = ctx.chat.title ?? ctx.chat.first_name;

        logger.info(
            `Time to generate notes in chat ${chatName}:`,
            (Date.now() - start) / 1000,
        );

        const summaryText = fixAIResponse(response.text);

        ctx.m.getChat().notes.push(summaryText);

        ctx.m.removeOldNotes(config.maxNotesToStore);

        return next();
    });

    return bot;
}
