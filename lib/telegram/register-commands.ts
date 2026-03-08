import { Composer } from 'grammy';
import { SlushaContext } from './setup-bot.ts';
import start from './commands/start.ts';
import forget from './commands/forget.ts';
import lobotomy from './commands/lobotomy.ts';
import changelog from './commands/changelog.ts';
import { registerModel } from './commands/model.ts';
import { registerRandom } from './commands/random.ts';
import { registerSummary } from './commands/summary.ts';
import registerHateMode from './commands/hatemode.ts';
import { registerConfig } from './commands/config.ts';
import { registerUsage } from './commands/usage.ts';

export function registerEarlyCommands(bot: Composer<SlushaContext>) {
    bot.use(start);
    bot.use(forget);
    bot.use(lobotomy);
    bot.use(changelog);
}

export function registerLateCommands(
    bot: Composer<SlushaContext>,
) {
    registerModel(bot);
    registerRandom(bot);
    registerSummary(bot);
    registerHateMode(bot);
    registerConfig(bot);
    registerUsage(bot);
}
