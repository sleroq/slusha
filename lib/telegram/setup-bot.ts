import { Bot, Context } from 'https://deno.land/x/grammy@v1.30.0/mod.ts';
import logger from '../logger.ts';
import { Config } from '../config.ts';
import { limit } from 'https://deno.land/x/grammy_ratelimiter@v1.2.0/mod.ts';
import { ChatMemory, Memory } from '../memory.ts';

interface RequestInfo {
    isRandom: boolean;
}

export type SlushaContext = Context & {
    info: RequestInfo;
    memory: Memory;
    m: ChatMemory;
};

export default function setupBot(config: Config) {
    const bot = new Bot<SlushaContext>(config.botToken);

    bot.catch((error) => logger.error(error));

    return bot;
}
