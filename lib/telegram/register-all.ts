import { Bot } from 'grammy';
import { SlushaContext } from './setup-bot.ts';
import { Config } from '../config.ts';
import { applyLocaleFromMemory, createI18n } from '../i18n/index.ts';
import optOut from './bot/opt-out.ts';
import contextCommand from './bot/context.ts';
import language from './bot/language.ts';
import character from './bot/character.ts';
import msgDelay from './bot/msg-delay.ts';
import notes from './bot/notes.ts';
import {
    registerEarlyCommands,
    registerLateCommands,
} from './register-commands.ts';
import { shouldReply } from './middlewares/should-reply.ts';
import { rollingLimiter, shortBurstLimiter } from './middlewares/rate-limit.ts';
import registerAI from './handlers/ai.ts';

export default function registerAll(bot: Bot<SlushaContext>, config: Config) {
    const i18n = createI18n();
    bot.use(i18n);
    bot.use(applyLocaleFromMemory());

    registerEarlyCommands(bot);

    bot.use(optOut);
    bot.use(contextCommand);
    bot.use(language);
    bot.use(character);

    registerLateCommands(bot, config);

    bot.use(msgDelay(config));
    bot.use(notes(config, bot.botInfo.id));

    bot.on(
        'message',
        shouldReply({
            names: config.names,
            tendToIgnore: config.tendToIgnore,
            tendToIgnoreProbability: config.tendToIgnoreProbability,
            tendToReply: config.tendToReply,
            tendToReplyProbability: config.tendToReplyProbability,
            randomReplyProbability: config.randomReplyProbability,
        }),
    );

    bot.use(shortBurstLimiter());
    bot.use(rollingLimiter());

    registerAI(bot, config);
}
