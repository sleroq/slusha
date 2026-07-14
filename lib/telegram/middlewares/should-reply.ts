import logger from '../../logger.ts';
import {
    createNameMatcher,
    msgTypeSupported,
    probability,
    testMessage,
} from '../../helpers.ts';
import { SlushaContext } from '../setup-bot.ts';
import { checkAndMaybeRecoverReplyRights } from './reply-rights-guard.ts';

export function shouldReply() {
    return async (ctx: SlushaContext, next: () => Promise<void>) => {
        const msg = await ctx.messages.getLastMessage();
        const currentMessage = ctx.msg;
        const effectiveConfig = await ctx.chatConfig.getEffectiveConfig();
        const isIgnoreCandidate = Boolean(msg?.text) &&
            msg.text.length < 20 &&
            testMessage(effectiveConfig.tendToIgnore, msg.text);

        if (!msg || !currentMessage) return;

        if (!(await checkAndMaybeRecoverReplyRights(ctx))) {
            return;
        }

        if (
            !msg.text && !msgTypeSupported(msg.info) &&
            !msg.info.new_chat_members
        ) {
            return;
        }

        if (msg.info.via_bot?.id === ctx.me.id) {
            return;
        }

        const chat = currentMessage.chat;

        if (chat.type === 'private') {
            await ctx.chats.patchChat(chat.id, { lastUse: Date.now() });
            return next();
        }

        const isDirectReplyToBot = currentMessage.reply_to_message?.from?.id ===
            ctx.me.id;
        const isGroupChat = currentMessage.chat.type === 'group' ||
            currentMessage.chat.type === 'supergroup';

        if (
            isGroupChat &&
            isDirectReplyToBot &&
            isIgnoreCandidate &&
            probability(effectiveConfig.tendToIgnoreProbability)
        ) {
            return;
        }

        if (isDirectReplyToBot) {
            await ctx.chats.patchChat(chat.id, { lastUse: Date.now() });
            return next();
        }

        if (msg.text.includes(ctx.me.username)) {
            return next();
        }

        const characterNames = (await ctx.characters.get())?.names;
        const names = effectiveConfig.names.concat(characterNames ?? []);
        const nameRegex = createNameMatcher(names);

        if (
            nameRegex.test(msg.text) &&
            !(msg.info.forward_origin?.type === 'user' &&
                msg.info.forward_origin.sender_user.id === ctx.me.id)
        ) {
            await ctx.chats.patchChat(chat.id, { lastUse: Date.now() });
            logger.info("Replying because of mentioned bot's name");
            return next();
        }

        if (
            isIgnoreCandidate &&
            probability(effectiveConfig.tendToIgnoreProbability)
        ) {
            return;
        }

        if (
            testMessage(effectiveConfig.tendToReply, msg.text) &&
            probability(effectiveConfig.tendToReplyProbability)
        ) {
            ctx.info.isRandom = true;
            return next();
        }

        if (probability(effectiveConfig.randomReplyProbability)) {
            ctx.info.isRandom = true;
            return next();
        }
    };
}
