import { GrammyError } from 'grammy';
import { ChatMember } from 'grammy_types';

export function canMemberSendTextMessages(member: ChatMember): boolean {
    switch (member.status) {
        case 'creator':
            return true;
        case 'administrator':
            if (typeof member.can_post_messages === 'boolean') {
                return member.can_post_messages;
            }
            return true;
        case 'member':
            return true;
        case 'restricted':
            return member.is_member && member.can_send_messages;
        case 'left':
        case 'kicked':
            return false;
    }
}

export function isMissingSendTextRightsError(error: unknown): boolean {
    if (!(error instanceof GrammyError)) {
        return false;
    }

    return error.method === 'sendMessage' &&
        error.error_code === 400 &&
        error.description.toLowerCase().includes(
            'not enough rights to send text messages',
        );
}
