import { Bot, Composer } from 'grammy';
import { SlushaContext } from './setup-bot.ts';
import { Config } from '../config.ts';
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
        const command = ctx.msg?.text?.trimStart().split(/\s+/, 1)[0];
        if (!command?.startsWith('/')) {
            return false;
        }

        const commandName = command.slice(1).split('@', 1)[0];
        return commands.includes(commandName);
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
    bot.use(createLazyMiddleware(
        async () => {
            const { default: character } = await import('./bot/character.ts');
            return character.middleware();
        },
        shouldLoadCharacter,
    ));

    bot.use(createLazyMiddleware(async () => {
        const { registerModel } = await import('./commands/model.ts');
        const composer = new Composer<SlushaContext>();
        registerModel(composer);
        return composer.middleware();
    }, shouldLoadCommand('model')));

    bot.use(createLazyMiddleware(async () => {
        const { registerRandom } = await import('./commands/random.ts');
        const composer = new Composer<SlushaContext>();
        registerRandom(composer);
        return composer.middleware();
    }, shouldLoadCommand('random')));

    bot.use(createLazyMiddleware(async () => {
        const { registerSummary } = await import('./commands/summary.ts');
        const composer = new Composer<SlushaContext>();
        registerSummary(composer);
        return composer.middleware();
    }, shouldLoadCommand('summary')));

    bot.use(createLazyMiddleware(async () => {
        const { default: registerHateMode } = await import(
            './commands/hatemode.ts'
        );
        const composer = new Composer<SlushaContext>();
        registerHateMode(composer);
        return composer.middleware();
    }, shouldLoadCommand('hatemode')));

    bot.use(createLazyMiddleware(async () => {
        const { registerConfig } = await import('./commands/config.ts');
        const composer = new Composer<SlushaContext>();
        registerConfig(composer);
        return composer.middleware();
    }, shouldLoadCommand('config', 'settings')));

    bot.on(
        'message',
        shouldReply(),
    );

    // bot.use(msgDelay());

    bot.use(shortBurstLimiter());
    bot.use(rollingLimiter());

    bot.use(createLazyMiddleware(async () => {
        const { createAIMiddleware } = await import('./handlers/ai.ts');
        return createAIMiddleware(bot).middleware();
    }));
}
