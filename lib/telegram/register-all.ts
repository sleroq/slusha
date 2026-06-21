import { Bot, Composer } from 'grammy';
import { SlushaContext } from './setup-bot.ts';
import { Config } from '../config.ts';
import { applyLocaleFromPersistence, createI18n } from '../i18n/index.ts';
import optOut from './bot/opt-out.ts';
import language from './bot/language.ts';
import msgDelay from './bot/msg-delay.ts';
import { shouldReply } from './middlewares/should-reply.ts';
import { rollingLimiter, shortBurstLimiter } from './middlewares/rate-limit.ts';

type SlushaMiddleware = Parameters<Composer<SlushaContext>['use']>[0];

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

function shouldLoadCommandHandlers(ctx: SlushaContext): boolean {
    return ctx.msg?.text?.startsWith('/') ?? false;
}

export default function registerAll(bot: Bot<SlushaContext>, _config: Config) {
    const i18n = createI18n();
    let commandHandlersPromise:
        | Promise<typeof import('./register-commands.ts')>
        | undefined;

    const loadCommandHandlers = () => {
        if (!commandHandlersPromise) {
            commandHandlersPromise = import('./register-commands.ts');
        }

        return commandHandlersPromise;
    };

    bot.use(i18n);
    bot.use(applyLocaleFromPersistence());

    bot.use(createLazyMiddleware(async () => {
        const { registerEarlyCommands } = await loadCommandHandlers();
        const composer = new Composer<SlushaContext>();
        registerEarlyCommands(composer);
        return composer.middleware();
    }, shouldLoadCommandHandlers));

    bot.use(optOut);
    bot.use(language);
    bot.use(createLazyMiddleware(
        async () => {
            const { default: character } = await import('./bot/character.ts');
            return character.middleware();
        },
        shouldLoadCharacter,
    ));

    bot.use(createLazyMiddleware(async () => {
        const { registerLateCommands } = await loadCommandHandlers();
        const composer = new Composer<SlushaContext>();
        registerLateCommands(composer);
        return composer.middleware();
    }, shouldLoadCommandHandlers));

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
