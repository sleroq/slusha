import logger from '../logger.ts';
import { Bot } from 'grammy';
import { SlushaContext } from '../telegram/setup-bot.ts';
import type { NodeSDK } from '@opentelemetry/sdk-node';
import { shutdownTelemetry } from './observability.ts';

export function wireShutdown(
    bot: Bot<SlushaContext>,
    sdk?: NodeSDK,
) {
    async function gracefulShutdown() {
        try {
            await shutdownTelemetry(sdk);
        } catch (error) {
            logger.error('Could not shutdown SDK: ', error);
        }

        bot.stop();
        Deno.exit();
    }

    Deno.addSignalListener('SIGINT', gracefulShutdown);
    Deno.addSignalListener('SIGTERM', gracefulShutdown);
}
