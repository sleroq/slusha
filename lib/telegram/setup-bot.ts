import { Bot, Context } from 'grammy';
import logger from '../logger.ts';
import { Config } from '../config.ts';
import { ChatMemory, Memory, ReplyTo } from '../memory.ts';

interface RequestInfo {
    isRandom: boolean;
    userToReply?: string;
    config: Config['ai'];
}

export type SlushaContext = Context & {
    info: RequestInfo;
    memory: Memory;
    m: ChatMemory;
};

export default async function setupBot(config: Config, memory: Memory) {
    Deno.mkdir('./tmp', { recursive: true });

    const bot = new Bot<SlushaContext>(config.botToken);

    bot.catch((error) => logger.error(error));

    bot.use((ctx, next) => {
        // Init custom context
        ctx.memory = memory;
        if (ctx.chat) {
            ctx.m = new ChatMemory(memory, ctx.chat);
        }
        ctx.info = { isRandom: false, config: config.ai };

        return next();
    });

    // TODO: Save other message types, like special events
    bot.on('message', (ctx, next) => {
        if (
            ctx.m.getChat().optOutUsers.find((u) => u.id === ctx.from?.id) &&
            (!ctx.msg.text || !['/optin', '/optout'].includes(ctx.msg.text))
        ) {
            return;
        }

        // Save all messages to memory
        let replyTo: ReplyTo | undefined;
        if (ctx.msg.reply_to_message) {
            replyTo = {
                id: ctx.msg.reply_to_message.message_id,
                text: ctx.msg.reply_to_message.text ??
                    ctx.msg.reply_to_message.caption ?? '',
                isMyself: false,
                info: ctx.msg.reply_to_message,
            };
        }

        // Save every message to memory
        ctx.m.addMessage({
            id: ctx.msg.message_id,
            text: ctx.msg.text ?? ctx.msg.caption ?? '',
            replyTo,
            isMyself: false,
            info: ctx.message,
        });

        if (ctx.from) {
            ctx.m.updateUser(ctx.from);
        }

        ctx.m.removeOldMessages(config.maxMessagesToStore);

        return next();
    });

    // TODO: Add support for group to supergroup migration

    await bot.init();

    return bot;
}
