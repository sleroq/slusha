import _Werror from './lib/werror.ts';
import logger from './lib/logger.ts';
import resolveConfig, { Config } from './lib/config.ts';
import setupBot from './lib/telegram/setup-bot.ts';
import { run } from '@grammyjs/runner';
import { loadMemory } from './lib/memory.ts';

// AI runtime details moved to handler module

// reply helpers used inside handler module
// rate limiter helpers moved to middlewares
import registerAll from './lib/telegram/register-all.ts';
import { startTelemetry } from './lib/app/observability.ts';
import { startSchedulers } from './lib/app/scheduler.ts';
import { wireShutdown } from './lib/app/shutdown.ts';

const sdk = startTelemetry();

// (schemas and reaction utilities moved to dedicated modules)

let config: Config;
try {
    config = await resolveConfig();
} catch (error) {
    logger.error('Config error: ', error);
    Deno.exit(1);
}

const memory = await loadMemory();
logger.info('Memory loaded');

const bot = await setupBot(config, memory);

// Register everything in correct order
registerAll(bot, config);

run(bot, {
    runner: {
        // @ts-expect-error drop_pending_updates is supported by grammY runner
        drop_pending_updates: true,
        fetch: {
            allowed_updates: [] as const, // TODO: Add reactions here, but make sure to preserve all default event types
        },
    },
});
logger.info('Bot started');

// TODO: Remind users about bot existence

const _stopSchedulers = startSchedulers({ memory, config, logger });

// Save memory on exit
wireShutdown(bot, memory, sdk);
