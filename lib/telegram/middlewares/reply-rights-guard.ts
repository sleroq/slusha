import logger from '../../logger.ts';
import { SlushaContext } from '../setup-bot.ts';
import { canMemberSendTextMessages } from '../reply-rights.ts';

const RIGHTS_PROBE_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;

export async function checkAndMaybeRecoverReplyRights(
    ctx: SlushaContext,
): Promise<boolean> {
    const chatInfo = ctx.chat;
    if (!chatInfo || chatInfo.type === 'private') {
        return true;
    }

    const chat = await ctx.m.getChat();
    if (!chat.disableRepliesDueToRights) {
        return true;
    }

    const now = Date.now();
    const lastProbeAt = chat.disabledReplyRightsLastProbeAt ?? 0;

    if (now - lastProbeAt < RIGHTS_PROBE_INTERVAL_MS) {
        return false;
    }

    await ctx.m.setDisabledReplyRightsLastProbeAt(now);

    try {
        const selfMember = await ctx.api.getChatMember(chatInfo.id, ctx.me.id);

        if (!canMemberSendTextMessages(selfMember)) {
            logger.info('Replies remain disabled due to send rights');
            return false;
        }

        await ctx.m.setDisableRepliesDueToRights(false);
        await ctx.m.setDisabledReplyRightsLastProbeAt(undefined);
        logger.info('Replies re-enabled after weekly rights probe');
        return true;
    } catch (error) {
        logger.warn('Could not probe bot chat rights: ', error);
        return false;
    }
}
