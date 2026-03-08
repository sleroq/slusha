import { ChatMessage, Member } from '../memory.ts';

interface ChatPromptAdditionParams {
    chatType: string;
    isComments: boolean;
    privateChatPromptAddition?: string;
    commentsPromptAddition?: string;
    groupChatPromptAddition?: string;
}

interface BuildChatInfoBlockParams {
    nowText: string;
    chatType: string;
    chatTitle?: string;
    userFirstName?: string;
    userUsername?: string;
    activeMembers?: Member[];
    notes?: string[];
    memory?: string;
    includeNotes?: boolean;
    includeMemory?: boolean;
}

export function isTelegramCommentsHistory(history: ChatMessage[]): boolean {
    return history.some((message) =>
        message.info.forward_origin?.type === 'channel' &&
        message.info.from?.first_name === 'Telegram'
    );
}

export function buildChatPromptAddition(
    params: ChatPromptAdditionParams,
): string {
    const {
        chatType,
        isComments,
        privateChatPromptAddition,
        commentsPromptAddition,
        groupChatPromptAddition,
    } = params;

    if (chatType === 'private') {
        return privateChatPromptAddition ?? '';
    }

    if (isComments) {
        return commentsPromptAddition ?? '';
    }

    return groupChatPromptAddition ?? '';
}

export function buildChatInfoBlock(params: BuildChatInfoBlockParams): string {
    const {
        nowText,
        chatType,
        chatTitle,
        userFirstName,
        userUsername,
        activeMembers = [],
        notes = [],
        memory,
        includeNotes = false,
        includeMemory = false,
    } = params;

    let text = `Date and time right now: ${nowText}`;

    if (chatType === 'private') {
        text += `\nЛичный чат с ${userFirstName ?? 'User'} (@${
            userUsername ?? 'unknown'
        })`;
    } else if (activeMembers.length > 0) {
        const prettyMembersList = activeMembers.map((member) => {
            let line = `- ${member.first_name}`;
            if (member.username) {
                line += ` (@${member.username})`;
            }
            return line;
        }).join('\n');

        text += `\nChat: ${
            chatTitle ?? 'Unknown chat'
        }, Active members:\n${prettyMembersList}`;
    }

    if (includeNotes && notes.length > 0) {
        text += `\n\nChat notes:\n${notes.join('\n')}`;
    }

    if (includeMemory && memory) {
        text += `\n\nMY OWN PERSONAL NOTES AND MEMORY:\n${memory}`;
    }

    return text;
}
