import Werror from '../werror.ts';
import logger from '../logger.ts';
import { Memory } from '../memory.ts';
import { Bot } from 'grammy';
import { SlushaContext } from '../telegram/setup-bot.ts';
import { NodeSDK } from '@opentelemetry/sdk-node';

export function wireShutdown(
    bot: Bot<SlushaContext>,
    memory: Memory,
    sdk: NodeSDK,
) {
    async function gracefulShutdown() {
        try {
            await sdk.shutdown();
        } catch (error) {
            logger.error('Could not shutdown SDK: ', error);
        }

        try {
            await memory.save();
            logger.info('Memory saved on exit');
        } catch (error) {
            throw new Werror(error, 'Saving memory on exit');
        } finally {
            bot.stop();
            Deno.exit();
        }
    }

    Deno.addSignalListener('SIGINT', gracefulShutdown);
    Deno.addSignalListener('SIGTERM', gracefulShutdown);
}
