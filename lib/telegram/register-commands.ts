import { Composer } from 'grammy';
import { SlushaContext } from './setup-bot.ts';
import { Config } from '../config.ts';
import start from './commands/start.ts';
import forget from './commands/forget.ts';
import lobotomy from './commands/lobotomy.ts';
import changelog from './commands/changelog.ts';
import { registerModel } from './commands/model.ts';
import { registerRandom } from './commands/random.ts';
import { registerSummary } from './commands/summary.ts';
import registerHateMode from './commands/hatemode.ts';

export function registerEarlyCommands(bot: Composer<SlushaContext>) {
    bot.use(start);
    bot.use(forget);
    bot.use(lobotomy);
    bot.use(changelog);
}

export function registerLateCommands(
    bot: Composer<SlushaContext>,
    config: Config,
) {
    registerModel(bot, config);
    registerRandom(bot, config);
    registerSummary(bot, config);
    registerHateMode(bot);
}
