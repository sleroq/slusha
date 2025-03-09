import { Bot, Context } from 'grammy';
import logger from '../logger.ts';
import { Config } from '../config.ts';
import { ChatMemory, Memory, ReplyTo } from '../memory.ts';

interface RequestInfo {
    isRandom: boolean;
    userToReply?: string;
    config: Config['ai'];
}

export type SlushaContext = Context & {
    info: RequestInfo;
    memory: Memory;
    m: ChatMemory;
};

// TODO: Maybe derive from bot info somehow?
const commands = [
    '/optout',
    '/optin',
    '/context',
    '/model',
    '/lobotomy',
    '/random',
    '/summary',
];

export default async function setupBot(config: Config, memory: Memory) {
    Deno.mkdir('./tmp', { recursive: true });

    const bot = new Bot<SlushaContext>(config.botToken);

    bot.catch((error) =>
        logger.error({
            ...error,
            ctx: { ...error.ctx, m: undefined, memory: undefined },
        })
    );

    bot.use((ctx, next) => {
        // Init custom context
        ctx.memory = memory;
        if (ctx.chat) {
            ctx.m = new ChatMemory(memory, ctx.chat);
        }
        ctx.info = { isRandom: false, config: config.ai };

        return next();
    });

    // TODO: Save other message types, like special events
    bot.on('message', (ctx, next) => {
        // Ignore opted out users and commands
        if (
            ctx.m.getChat().optOutUsers.some((u) => u.id === ctx.from?.id)
        ) {
            return;
        }

        if (
            commands.some((c) => ctx.msg.text?.startsWith(c))
        ) {
            return next();
        }

        // Save all messages to memory
        let replyTo: ReplyTo | undefined;
        if (ctx.msg.reply_to_message) {
            replyTo = {
                id: ctx.msg.reply_to_message.message_id,
                text: ctx.msg.reply_to_message.text ??
                    ctx.msg.reply_to_message.caption ?? '',
                isMyself: false,
                info: ctx.msg.reply_to_message,
            };
        }

        // Save every message to memory
        ctx.m.addMessage({
            id: ctx.msg.message_id,
            text: ctx.msg.text ?? ctx.msg.caption ?? '',
            replyTo,
            isMyself: false,
            info: ctx.message,
        });

        if (ctx.from) {
            ctx.m.updateUser(ctx.from);
        }

        ctx.m.removeOldMessages(config.maxMessagesToStore);

        return next();
    });

    bot.on(':left_chat_member', (ctx, next) => {
        ctx.m.getChat().members = ctx.m.getChat().members.filter((m) =>
            m.id !== ctx.from?.id
        );

        return next();
    });

    bot.on('edit:text', (ctx, next) => {
        const history = ctx.m.getChat().history;

        for (const msg of history) {
            if (msg.id === ctx.msg.message_id) {
                msg.text = ctx.msg.text ?? ctx.msg.caption ?? '';
            }
        }

        return next();
    });

    bot.on(':migrate_from_chat_id', (ctx, next) => {
        const from = ctx.msg.migrate_from_chat_id;
        const to = ctx.chat.id;

        ctx.memory.chats[to] = ctx.memory.chats[from];
        delete ctx.memory.chats[from];

        logger.debug(
            `Successfully migrated "${ctx.chat.title}" from ${from} to ${to}`,
        );

        return next();
    });

    await bot.init();

    return bot;
}
