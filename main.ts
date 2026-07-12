import logger from './lib/logger.ts';
import resolveConfig, { Config } from './lib/config.ts';
import setupBot from './lib/telegram/setup-bot.ts';
import { run } from '@grammyjs/runner';
import { migrateDb } from './lib/db/migrate.ts';
import { getDb } from './lib/db/client.ts';

// reply helpers used inside handler module
import registerAll from './lib/telegram/register-all.ts';
import { startTelemetry } from './lib/app/observability.ts';
import { startSchedulers } from './lib/app/scheduler.ts';
import { wireShutdown } from './lib/app/shutdown.ts';
import { startWebServer } from './lib/web/server.ts';

const sdk = await startTelemetry();

await migrateDb();

const db = getDb();
logger.info('Database ready');

let config: Config;
try {
    config = await resolveConfig(db);
} catch (error) {
    logger.error('Config error: ', error);
    Deno.exit(1);
}

const bot = await setupBot(config, db);

const webServer = startWebServer();

// Register everything in correct order
registerAll(bot);

const runner = run(bot, {
    runner: {
        // @ts-expect-error drop_pending_updates is supported by grammY runner
        drop_pending_updates: true,
        fetch: {
            allowed_updates: [
                'message',
                'edited_message',
                'channel_post',
                'edited_channel_post',
                'business_connection',
                'business_message',
                'edited_business_message',
                'deleted_business_messages',
                'inline_query',
                'chosen_inline_result',
                'callback_query',
                'shipping_query',
                'pre_checkout_query',
                'purchased_paid_media',
                'poll',
                'poll_answer',
                'my_chat_member',
                'chat_member',
                'chat_join_request',
                'chat_boost',
                'removed_chat_boost',
                'message_reaction',
                'message_reaction_count',
            ] as const,
        },
    },
});

// The runner polls Telegram in a detached task; observe failures so Deno does
// not terminate with an unhelpful "Uncaught null" message.
void runner.task()?.catch((error) => {
    logger.error('Telegram polling runner stopped unexpectedly:', error);
    Deno.exit(1);
});

logger.info('Bot started');

// TODO: Remind users about bot existence

const stopSchedulers = startSchedulers({ db, logger });

wireShutdown({ runner, webServer, stopSchedulers, sdk });
