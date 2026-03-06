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
        const msg = await ctx.m.getLastMessage();
        const currentMessage = ctx.msg;
        const effectiveConfig = await ctx.m.getEffectiveConfig();

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

        if (currentMessage.chat.type === 'private') {
            await ctx.m.setLastUse(Date.now());
            return next();
        }

        if (currentMessage.reply_to_message?.from?.id === ctx.me.id) {
            await ctx.m.setLastUse(Date.now());
            return next();
        }

        if (msg.text.includes(ctx.me.username)) {
            return next();
        }

        const characterNames = (await ctx.m.getChat()).character?.names;
        const names = effectiveConfig.names.concat(characterNames ?? []);
        const nameRegex = createNameMatcher(names);

        if (
            nameRegex.test(msg.text) &&
            !(msg.info.forward_origin?.type === 'user' &&
                msg.info.forward_origin.sender_user.id === ctx.me.id)
        ) {
            await ctx.m.setLastUse(Date.now());
            logger.info("Replying because of mentioned bot's name");
            return next();
        }

        if (
            testMessage(effectiveConfig.tendToIgnore, msg.text) &&
            msg.text.length < 20 &&
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

        const randomReplyProbability =
            (await ctx.m.getChat()).randomReplyProbability ??
                effectiveConfig.randomReplyProbability;

        if (probability(randomReplyProbability)) {
            ctx.info.isRandom = true;
            return next();
        }
    };
}
