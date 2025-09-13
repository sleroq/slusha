import logger from '../../logger.ts';
import {
    createNameMatcher,
    msgTypeSupported,
    probability,
    testMessage,
} from '../../helpers.ts';
import { SlushaContext } from '../setup-bot.ts';

export function shouldReply(config: {
    names: (string | RegExp)[];
    tendToIgnore: (string | RegExp)[];
    tendToIgnoreProbability: number;
    tendToReply: (string | RegExp)[];
    tendToReplyProbability: number;
    randomReplyProbability: number;
}) {
    return (ctx: SlushaContext, next: () => Promise<void>) => {
        const msg = ctx.m.getLastMessage();

        if (!msg) return;

        if (
            !msg.text && !msgTypeSupported(msg.info) &&
            !msg.info.new_chat_members
        ) {
            return;
        }

        if (msg.info.via_bot?.id === ctx.me.id) {
            return;
        }

        if (ctx.msg.chat.type === 'private') {
            ctx.m.getChat().lastUse = Date.now();
            return next();
        }

        if (ctx.msg.reply_to_message?.from?.id === ctx.me.id) {
            ctx.m.getChat().lastUse = Date.now();
            return next();
        }

        if (msg.text.includes(ctx.me.username)) {
            return next();
        }

        const characterNames = ctx.m.getChat().character?.names;
        const names = config.names.concat(characterNames ?? []);
        const nameRegex = createNameMatcher(names);

        if (
            nameRegex.test(msg.text) &&
            !(msg.info.forward_origin?.type === 'user' &&
                msg.info.forward_origin.sender_user.id === ctx.me.id)
        ) {
            ctx.m.getChat().lastUse = Date.now();
            logger.info("Replying because of mentioned bot's name");
            return next();
        }

        if (
            testMessage(config.tendToIgnore, msg.text) &&
            msg.text.length < 20 &&
            probability(config.tendToIgnoreProbability)
        ) {
            return;
        }

        if (
            testMessage(config.tendToReply, msg.text) &&
            probability(config.tendToReplyProbability)
        ) {
            ctx.info.isRandom = true;
            return next();
        }

        const randomReplyProbability = ctx.m.getChat().randomReplyProbability ??
            config.randomReplyProbability;

        if (probability(randomReplyProbability)) {
            ctx.info.isRandom = true;
            return next();
        }
    };
}
