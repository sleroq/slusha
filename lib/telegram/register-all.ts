import { Bot, Composer } from 'grammy';
import type { SlushaContext } from './setup-bot.ts';
import type { Config } from '../config.ts';
import { applyLocaleFromPersistence, createI18n } from '../i18n/index.ts';
import optOut from './bot/opt-out.ts';
import language from './bot/language.ts';
import msgDelay from './bot/msg-delay.ts';
import { shouldReply } from './middlewares/should-reply.ts';
import { rollingLimiter, shortBurstLimiter } from './middlewares/rate-limit.ts';
import start from './commands/start.ts';
import forget from './commands/forget.ts';
import lobotomy from './commands/lobotomy.ts';
import changelog from './commands/changelog.ts';

type SlushaMiddleware = Parameters<Composer<SlushaContext>['use']>[0];

type LazyCommandDescriptor = {
    names: readonly string[];
    load: () => Promise<SlushaMiddleware>;
};

const eagerCommandNames = [
    'start',
    'forget',
    'lobotomy',
    'changelog',
    'optout',
    'optin',
    'language',
] as const;

function createCommandMiddleware(
    register: (composer: Composer<SlushaContext>) => void,
): SlushaMiddleware {
    const composer = new Composer<SlushaContext>();
    register(composer);
    return composer.middleware();
}

const lazyCommands = [
    {
        names: ['character'],
        load: async () => {
            const { default: character } = await import('./bot/character.ts');
            return character.middleware();
        },
    },
    {
        names: ['model'],
        load: async () => {
            const { registerModel } = await import('./commands/model.ts');
            return createCommandMiddleware(registerModel);
        },
    },
    {
        names: ['random'],
        load: async () => {
            const { registerRandom } = await import('./commands/random.ts');
            return createCommandMiddleware(registerRandom);
        },
    },
    {
        names: ['summary'],
        load: async () => {
            const { registerSummary } = await import('./commands/summary.ts');
            return createCommandMiddleware(registerSummary);
        },
    },
    {
        names: ['hatemode'],
        load: async () => {
            const { default: registerHateMode } = await import(
                './commands/hatemode.ts'
            );
            return createCommandMiddleware(registerHateMode);
        },
    },
] as const satisfies readonly LazyCommandDescriptor[];

export const registeredCommandNames = [
    ...eagerCommandNames,
    ...lazyCommands.flatMap((command) => command.names),
] as readonly string[];

export function getMessageCommand(text: string): string | undefined {
    const command = text.split(/\s+/, 1)[0];
    if (!command?.startsWith('/')) {
        return undefined;
    }

    return command.slice(1).split('@', 1)[0];
}

export function isRegisteredCommand(text: string | undefined): boolean {
    if (text === undefined) return false;
    const command = getMessageCommand(text);
    return command !== undefined && registeredCommandNames.includes(command);
}

function toMiddlewareFn(middleware: SlushaMiddleware) {
    return typeof middleware === 'function'
        ? middleware
        : middleware.middleware();
}

function createLazyMiddleware(
    load: () => Promise<SlushaMiddleware>,
    shouldLoad?: (ctx: SlushaContext) => boolean,
): SlushaMiddleware {
    let middlewarePromise: Promise<SlushaMiddleware> | undefined;

    return async (ctx, next) => {
        if (shouldLoad && !shouldLoad(ctx)) {
            return next();
        }

        if (!middlewarePromise) {
            middlewarePromise = load();
        }

        const middleware = await middlewarePromise;
        return toMiddlewareFn(middleware)(ctx, next);
    };
}

function shouldLoadCharacter(ctx: SlushaContext): boolean {
    if (ctx.inlineQuery) {
        return true;
    }

    if (ctx.callbackQuery?.data?.startsWith('set ')) {
        return true;
    }

    return ctx.msg?.text?.startsWith('/character') ?? false;
}

function shouldLoadCommand(...commands: string[]) {
    return (ctx: SlushaContext): boolean => {
        if (!ctx.msg?.text) {
            return false;
        }

        const commandName = getMessageCommand(ctx.msg.text);
        return commandName !== undefined && commands.includes(commandName);
    };
}

export default function registerAll(bot: Bot<SlushaContext>, _config: Config) {
    const i18n = createI18n();

    bot.use(i18n);
    bot.use(applyLocaleFromPersistence());

    bot.use(start);
    bot.use(forget);
    bot.use(lobotomy);
    bot.use(changelog);

    bot.use(optOut);
    bot.use(language);
    for (const command of lazyCommands) {
        const shouldLoad = command.names.some((name) => name === 'character')
            ? shouldLoadCharacter
            : shouldLoadCommand(...command.names);
        bot.use(createLazyMiddleware(command.load, shouldLoad));
    }

    bot.on(
        'message',
        shouldReply(),
    );

    bot.use(msgDelay());

    bot.use(shortBurstLimiter());
    bot.use(rollingLimiter());

    bot.use(createLazyMiddleware(async () => {
        const { createAIMiddleware } = await import('./handlers/ai.ts');
        return createAIMiddleware(bot).middleware();
    }));
}
