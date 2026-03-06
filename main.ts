import _Werror from './lib/werror.ts';
import logger from './lib/logger.ts';
import resolveConfig, { Config, UserConfig } from './lib/config.ts';
import setupBot from './lib/telegram/setup-bot.ts';
import { run } from '@grammyjs/runner';
import { loadMemory } from './lib/memory.ts';
import { migrateDb } from './lib/db/migrate.ts';

// AI runtime details moved to handler module

// reply helpers used inside handler module
// rate limiter helpers moved to middlewares
import registerAll from './lib/telegram/register-all.ts';
import { startTelemetry } from './lib/app/observability.ts';
import { startSchedulers } from './lib/app/scheduler.ts';
import { wireShutdown } from './lib/app/shutdown.ts';
import { startWebServer } from './lib/web/server.ts';

const sdk = startTelemetry();

// (schemas and reaction utilities moved to dedicated modules)

let config: Config;

await migrateDb();

const memory = await loadMemory();
logger.info('Memory loaded');

try {
    config = await resolveConfig(memory.db);
} catch (error) {
    logger.error('Config error: ', error);
    Deno.exit(1);
}

const runtimeConfig = {
    get: () => config,
    applyUserConfig: (next: UserConfig) => {
        const envPart = {
            botToken: config.botToken,
            aiToken: config.aiToken,
        };
        config = { ...next, ...envPart };
    },
};

const bot = await setupBot(config, memory);

startWebServer({
    bot,
    memory,
    runtimeConfig,
});

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

const _stopSchedulers = startSchedulers({ config, logger });

// Save memory on exit
wireShutdown(bot, sdk);
