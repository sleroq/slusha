import { Bot, Context } from 'https://deno.land/x/grammy@v1.30.0/mod.ts';
import logger from '../logger.ts';
import { Config } from '../config.ts';
import { ChatMemory, Memory, ReplyTo } from '../memory.ts';
import { getText } from '../helpers.ts';

interface RequestInfo {
    isRandom: boolean;
    userToReply?: string;
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
        ctx.info = { isRandom: false };

        return next();
    });

    bot.on('message', (ctx, next) => {
        if (ctx.m.getChat().optOutUsers.find((u) => u.id === ctx.from?.id)) {
            return;
        }

        // Save all messages to memory
        let replyTo: ReplyTo | undefined;
        if (ctx.msg.reply_to_message && ctx.msg.reply_to_message.from) {
            replyTo = {
                id: ctx.msg.reply_to_message.message_id,
                text: getText(
                    ctx.msg.reply_to_message,
                ) ?? '',
                isMyself: false,
                info: ctx.msg.reply_to_message,
            };
        }

        // Save every message to memory
        ctx.m.addMessage({
            id: ctx.msg.message_id,
            text: getText(ctx.msg) ?? '',
            replyTo,
            isMyself: false,
            info: ctx.message,
        });

        ctx.m.removeOldMessages(config.maxMessagesToStore);

        return next();
    });

    await bot.init();

    return bot;
}
