import Werror from '../werror.ts';
import logger from '../logger.ts';
import { Bot } from 'grammy';
import { SlushaContext } from '../telegram/setup-bot.ts';
import { NodeSDK } from '@opentelemetry/sdk-node';

import { disconnectPrisma } from '../db/client.ts';

export function wireShutdown(
    bot: Bot<SlushaContext>,
    sdk: NodeSDK,
) {
    async function gracefulShutdown() {
        try {
            await sdk.shutdown();
        } catch (error) {
            logger.error('Could not shutdown SDK: ', error);
        }

        try {
            await disconnectPrisma();
        } catch (error) {
            throw new Werror(error, 'Disconnecting prisma on exit');
        } finally {
            bot.stop();
            Deno.exit();
        }
    }

    Deno.addSignalListener('SIGINT', gracefulShutdown);
    Deno.addSignalListener('SIGTERM', gracefulShutdown);
}
