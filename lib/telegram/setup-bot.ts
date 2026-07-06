import { Bot, Context } from 'grammy';
import { I18nFlavor } from '@grammyjs/i18n';
import logger from '../logger.ts';
import { Config } from '../config.ts';
import type { DbClient } from '../db/client.ts';
import { ChatConfigRepository } from '../persistence/chat-config.ts';
import { CharacterRepository } from '../persistence/characters.ts';
import { ChatRepository } from '../persistence/chats.ts';
import { MemberRepository } from '../persistence/members.ts';
import { MessageRepository } from '../persistence/messages.ts';
import { OptOutRepository } from '../persistence/opt-outs.ts';
import type { ReplyTo } from '../persistence/types.ts';
import { sequentialize } from '@grammyjs/runner';
import { canMemberSendTextMessages } from './reply-rights.ts';
import { Message } from 'grammy_types';
import { isRegisteredCommand } from './register-all.ts';
import reactions from './handlers/reactions.ts';

interface RequestInfo {
    isRandom: boolean;
    userToReply?: string;
    config: Config['ai'];
}

interface ThreadResolution {
    threadId: string;
    threadRootMessageId: number;
    threadParentMessageId?: number;
    threadSource: string;
}

export type SlushaContext = Context & I18nFlavor & {
    info: RequestInfo;
    db: DbClient;
    chats: ChatRepository;
    chatConfig: ChatConfigRepository;
    characters: CharacterRepository;
    members: MemberRepository;
    messages: MessageRepository;
    optOuts: OptOutRepository;
};

function isSameTopic(left: Message, right: Message): boolean {
    const leftTopic = left.message_thread_id;
    const rightTopic = right.message_thread_id;
    return leftTopic === rightTopic;
}

async function resolveThreadForIncomingMessage(
    messages: MessageRepository,
    incoming: Message,
    replyToId?: number,
): Promise<ThreadResolution> {
    if (typeof replyToId === 'number') {
        const parent = await messages.getMessageById(replyToId);
        const inheritedRoot = parent?.threadRootMessageId ?? replyToId;
        const inheritedThread = parent?.threadId ?? `thread:${inheritedRoot}`;

        return {
            threadId: inheritedThread,
            threadRootMessageId: inheritedRoot,
            threadParentMessageId: replyToId,
            threadSource: parent ? 'explicit_reply' : 'explicit_reply_external',
        };
    }

    const incomingAuthorId = incoming.from?.id;
    const incomingDate = incoming.date;
    const maxGapSeconds = 180;
    const maxInterveningMessages = 6;

    if (typeof incomingAuthorId === 'number') {
        const candidate = await messages.getLastMessageByAuthorInTopic(
            incomingAuthorId,
            incoming.message_thread_id,
            maxInterveningMessages + 1,
        );

        if (candidate && isSameTopic(candidate.info, incoming)) {
            const candidateDate = candidate.info.date;
            const secondsSince = incomingDate - candidateDate;
            if (secondsSince <= maxGapSeconds) {
                const inheritedRoot = candidate.threadRootMessageId ??
                    candidate.id;
                const inheritedThread = candidate.threadId ??
                    `thread:${inheritedRoot}`;
                return {
                    threadId: inheritedThread,
                    threadRootMessageId: inheritedRoot,
                    threadParentMessageId: candidate.id,
                    threadSource: 'implicit_same_author',
                };
            }
        }
    }

    return {
        threadId: `thread:${incoming.message_id}`,
        threadRootMessageId: incoming.message_id,
        threadSource: 'new_thread',
    };
}

const startDate = new Date();

export default async function setupBot(
    config: Config,
    db: DbClient,
) {
    void Deno.mkdir('./tmp', { recursive: true });

    const bot = new Bot<SlushaContext>(config.botToken);

    bot.catch((error) => {
        logger.error({
            ...error,
            ctx: {
                ...error.ctx,
                chats: undefined,
                chatConfig: undefined,
                characters: undefined,
                members: undefined,
                messages: undefined,
                optOuts: undefined,
            },
        });
    });

    // Make sure messages are handled sequentially
    bot.use(sequentialize((ctx) => {
        const chat = ctx.chat?.id.toString();
        const user = ctx.from?.id.toString();
        return [chat, user].filter((con) => con !== undefined);
    }));

    bot.use(async (ctx, next) => {
        // Init custom context
        ctx.db = db;
        ctx.chats = new ChatRepository(db);
        let aiConfig = config.ai;
        if (ctx.chat) {
            await ctx.chats.ensureChat(ctx.chat);
            ctx.chatConfig = new ChatConfigRepository(db, ctx.chat.id);
            ctx.characters = new CharacterRepository(db, ctx.chat.id);
            ctx.members = new MemberRepository(db, ctx.chat.id);
            ctx.messages = new MessageRepository(db, ctx.chat.id);
            ctx.optOuts = new OptOutRepository(db, ctx.chat.id);
            const effective = await ctx.chatConfig.getEffectiveConfig();
            aiConfig = effective.ai;
        }
        ctx.info = { isRandom: false, config: aiConfig };

        return next();
    });

    bot.use(reactions);

    // TODO: Save other message types, like special events
    bot.on('message', async (ctx, next) => {
        // Filter out old messages (1 minute)
        if (ctx.msg.date - startDate.getTime() / 1000 < 1) {
            // console.log(
            //     'Skipping old message',
            //     ctx.msg.date,
            //     startDate.getTime() / 1000,
            // );
            return;
        } else {
            // console.log(
            //     'Processing message',
            //     ctx.msg.date,
            //     startDate.getTime() / 1000,
            // );
        }

        // Ignore opted out users and commands
        if (
            (await ctx.optOuts.list()).some((u) => u.id === ctx.from?.id) &&
            !ctx.msg.text?.startsWith('/optin')
        ) {
            return;
        }

        if (isRegisteredCommand(ctx.msg.text)) {
            return next();
        }

        // Save all messages to memory
        let replyTo: ReplyTo | undefined;
        let replyToId: number | undefined;
        if (ctx.msg.reply_to_message) {
            replyToId = ctx.msg.reply_to_message.message_id;
            replyTo = {
                id: replyToId,
                text: ctx.msg.reply_to_message.text ??
                    ctx.msg.reply_to_message.caption ?? '',
                isMyself: false,
                info: ctx.msg.reply_to_message,
            };
        }

        const threadResolution = await resolveThreadForIncomingMessage(
            ctx.messages,
            ctx.msg,
            replyToId,
        );

        // Save every message to memory
        await ctx.messages.addMessage({
            id: ctx.msg.message_id,
            text: ctx.msg.text ?? ctx.msg.caption ?? '',
            replyTo,
            threadId: threadResolution.threadId,
            threadRootMessageId: threadResolution.threadRootMessageId,
            threadParentMessageId: threadResolution.threadParentMessageId,
            threadSource: threadResolution.threadSource,
            isMyself: false,
            info: ctx.message,
        });

        if (ctx.from) {
            await ctx.members.updateUser(ctx.from);
        }

        const effectiveConfig = await ctx.chatConfig.getEffectiveConfig();
        await ctx.messages.removeOldMessages(
            effectiveConfig.maxMessagesToStore,
        );

        return next();
    });

    bot.on('my_chat_member', async (ctx, next) => {
        try {
            const update = ctx.update.my_chat_member;
            if (!update) return next();

            if (canMemberSendTextMessages(update.new_chat_member)) {
                await ctx.chatConfig.clearDisableRepliesDueToRights();
                await ctx.chatConfig.clearDisabledReplyRightsLastProbeAt();
            } else {
                await ctx.chatConfig.disableRepliesDueToRights();
                await ctx.chatConfig.setDisabledReplyRightsLastProbeAt(
                    Date.now(),
                );
            }
        } catch (error) {
            logger.warn('Could not process my_chat_member update: ', error);
        }

        return next();
    });

    bot.on(':left_chat_member', async (ctx, next) => {
        if (ctx.from?.id) {
            await ctx.members.removeMember(ctx.from.id);
        }

        return next();
    });

    bot.on('edit:text', async (ctx, next) => {
        await ctx.messages.updateMessageText(
            ctx.msg.message_id,
            ctx.msg.text ?? ctx.msg.caption ?? '',
        );

        return next();
    });

    bot.on(':migrate_from_chat_id', async (ctx, next) => {
        const from = ctx.msg.migrate_from_chat_id;
        const to = ctx.chat.id;

        await ctx.chats.migrateChat(from, to, ctx.chat);

        logger.debug(
            `Successfully migrated "${ctx.chat.title}" from ${from} to ${to}`,
        );

        return next();
    });

    await bot.init();

    return bot;
}
