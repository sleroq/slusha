import { Bot, Context } from 'https://deno.land/x/grammy@v1.30.0/mod.ts';
import logger from '../logger.ts';
import { Config } from '../config.ts';
import { ChatMemory, Memory } from '../memory.ts';

interface RequestInfo {
    isRandom: boolean;
    userToReply?: string;
}

export type SlushaContext = Context & {
    info: RequestInfo;
    memory: Memory;
    m: ChatMemory;
};

export default function setupBot(config: Config, memory: Memory) {
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

    return bot;
}
