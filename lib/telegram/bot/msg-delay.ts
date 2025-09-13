import logger from '../../logger.ts';
import { SlushaContext } from '../setup-bot.ts';
import { Config } from '../../config.ts';
import { Composer } from 'grammy';
import { doTyping } from '../helpers.ts';

export default function msgDelay(config: Config) {
    const bot = new Composer<SlushaContext>();

    bot.on('message', (ctx, next) => {
        async function handleNext() {
            try {
                await next();
            } catch (error) {
                logger.error('Could not handle message: ', error);
            }
        }

        // TODO: Make sure this will not cause any concurrency issues (how)

        // Wait for half a second before replying
        // to make sure user is finished typing
        setTimeout(async () => {
            // If user is sent something after this message, drop current one

            const history = ctx.m.getHistory();

            // Get last message from this user in chat
            const lastUserMessage = history.filter((msg) =>
                msg.info.from?.id === ctx.msg.from?.id
            ).slice(-1)[0];
            if (!lastUserMessage) {
                logger.info(
                    'Replying but could not find last message from user',
                );
                const typing = doTyping(ctx, logger);
                try {
                    await handleNext();
                } finally {
                    typing.abort();
                }
                return;
            }

            if (lastUserMessage.id !== ctx.msg.message_id) {
                // Dropping message because user sent something new
                return;
            }

            if (ctx.m.getLastMessage().id !== lastUserMessage.id) {
                // If user's last message is followed by messages from other users
                // then add info to which user to reply
                ctx.info.userToReply = ctx.msg.from?.username ??
                    ctx.chat.first_name;
            }
            const typing = doTyping(ctx, logger);
            try {
                await handleNext();
            } finally {
                typing.abort();
            }
        }, config.responseDelay * 1000);
    });

    return bot;
}
