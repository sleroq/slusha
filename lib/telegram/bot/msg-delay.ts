import logger from '../../logger.ts';
import { SlushaContext } from '../setup-bot.ts';
import { Composer } from 'grammy';
import { doTyping } from '../helpers.ts';

export default function msgDelay() {
    const bot = new Composer<SlushaContext>();

    bot.on('message', async (ctx, next) => {
        async function handleNext() {
            try {
                await next();
            } catch (error) {
                logger.error('Could not handle message: ', error);
            }
        }

        const effectiveConfig = await ctx.chatConfig.getEffectiveConfig();

        // Wait for configured delay before replying
        await new Promise((resolve) =>
            setTimeout(resolve, effectiveConfig.responseDelay * 1000)
        );

        const typing = doTyping(ctx, logger);
        try {
            await handleNext();
        } finally {
            typing.abort();
        }
    });

    return bot;
}
