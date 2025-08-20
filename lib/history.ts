import { Api, RawApi } from 'grammy';
import { CoreMessage } from 'npm:ai';
import {
    chooseSize,
    downloadFile,
    getImageContent,
    removeFieldsWithSuffixes,
    sliceMessage,
} from './helpers.ts';
import { ChatMessage, ReplyTo } from './memory.ts';
import { Message } from 'grammy_types';
import { Logger } from '@deno-library/logger';
import logger from './logger.ts';

export interface FileContent {
    type: 'file';
    mimeType: string;
    data: Uint8Array | ArrayBuffer | string;
}

export interface TextPart {
    type: 'text';
    text: string;
}

export interface ImagePart {
    type: 'image';
    image: Uint8Array | ArrayBuffer | URL | string;
    mimeType?: string;
}

type ContentPart = TextPart | ImagePart | FileContent;

type MessageContent = ContentPart[];

interface HistoryOptions {
    symbolLimit: number;
    messagesLimit: number;
    bytesLimit: number;
    attachments?: boolean;
    resolveReplyThread?: boolean;
}

function resolveReplyThread(
    history: ChatMessage[],
    msg: ChatMessage,
    thread: ChatMessage[] = [],
): ChatMessage[] {
    thread.push(msg);

    const replyTo = msg.replyTo;
    if (!replyTo) {
        return thread;
    }

    const replyToMsg = history.find((m) => m.id === replyTo.id);
    if (replyToMsg) {
        return resolveReplyThread(history, replyToMsg, thread);
    } else {
        // For bot relies and stuff not saved in history
        thread.push({
            id: replyTo.id,
            text: replyTo.text ?? replyTo.info.caption ?? '',
            replyTo: replyTo,
            isMyself: false,
            info: replyTo.info,
        });
    }

    return thread;
}

type PrintType = (name: keyof Message, msg: Message) => string;

function getAttachmentDefault(name: keyof Message) {
    return `"${String(name)}": true`;
}

function getStickerAttachment(name: keyof Message, msg: Message) {
    return `"${String(name)}": { "emoji": "${msg.sticker?.emoji}" }`;
}

export const supportedTypesMap = new Map<keyof Message, PrintType>([
    ['animation', getAttachmentDefault],
    ['video', getAttachmentDefault],
    // ['audio', getAttachmentDefault],
    // ['document', getAttachmentDefault],
    ['photo', getAttachmentDefault],
    ['sticker', getStickerAttachment],
    ['video_note', getAttachmentDefault],
    ['voice', getAttachmentDefault],
]);

export const jsonTypes: Array<keyof Message> = [
    'audio',
    'document',
    'story',
    'contact',
    'dice',
    'game',
    'poll',
    'venue',
    'location',
    'new_chat_members',
    'left_chat_member',
    'new_chat_title',
    'new_chat_photo',
    'delete_chat_photo',
    'group_chat_created',
    'supergroup_chat_created',
    'channel_chat_created',
    'message_auto_delete_timer_changed',
    'migrate_to_chat_id',
    'migrate_from_chat_id',
    'pinned_message',
    'invoice',
    'successful_payment',
    'refunded_payment',
    'users_shared',
    'chat_shared',
    'connected_website',
    'write_access_allowed',
    'passport_data',
    'proximity_alert_triggered',
    'boost_added',
    'chat_background_set',
    'forum_topic_created',
    'forum_topic_edited',
    'forum_topic_closed',
    'forum_topic_reopened',
    'general_forum_topic_hidden',
    'general_forum_topic_unhidden',
    'giveaway_created',
    'giveaway',
    'giveaway_winners',
    'giveaway_completed',
    'video_chat_scheduled',
    'video_chat_started',
    'video_chat_ended',
    'video_chat_participants_invited',
    'web_app_data',
];

interface JSONInputMessage {
    user?: { name: string; username?: string };
    reply_to?: string; // username
    forward_origin?: unknown;
    text: string;
}

interface ConstructMsgOptions {
    symbolLimit: number;
    attachments: boolean;
    characterName?: string;
}

function getTimeString(date: Date): string {
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');

    return `${hours}:${minutes}`;
}

async function constructMsg(
    api: Api<RawApi>,
    botInfo: { token: string; id: number },
    msg: ChatMessage,
    options: ConstructMsgOptions,
): Promise<CoreMessage> {
    const { symbolLimit, characterName } = options;
    const attachAttachments = options.attachments;

    const role = msg.isMyself ? 'assistant' : 'user';
    const firstName = msg.info.from?.first_name ?? 'User';
    let text = msg.text ? sliceMessage(msg.text, symbolLimit) : '';

    // Label message types if it's not just text
    let isSupported = false;

    for (const [type, printType] of supportedTypesMap) {
        if (msg.info[type] !== undefined) {
            text += `\n${printType(type, msg.info)}`;
            isSupported = true;
        }
    }

    // Pass unsupported messages as json
    // TODO: Remove unnecessary fields to reduce size and improve prompt
    if (!isSupported) {
        for (const type of jsonTypes) {
            if (msg.info[type] !== undefined) {
                const prettyJsonObject = removeFieldsWithSuffixes(
                    msg.info[type],
                );
                text += `\n"${String(type)}": ${JSON.stringify(prettyJsonObject)}`;
            }
        }
    }

    if (!text) {
        throw new Error('Message is not supported');
    }

    const parts: MessageContent = [];

    let username = msg.info.from?.username;
    if (username) {
        username = '@' + msg.info.from?.username;
    }

    const user: JSONInputMessage['user'] = {
        name: firstName,
        username,
    };

    let replyTo = msg.replyTo?.info.from?.username;
    if (replyTo) {
        replyTo = '@' + replyTo;
    }

    // JSON message format example. More extensible but less human-readable and seems to be performing worse
    // const inputMessage: JSONInputMessage[] = [{
    //     user: msg.isMyself ? undefined : user,
    //     reply_to: replyTo,
    //     forward_origin: msg.info.forward_origin, // TODO: Maybe make it prettier
    //     text: text.trim(),
    // }];

    // const prettyInputMessage = JSON.stringify(inputMessage, null, 2);
    // const prettyInputMessage = JSON.stringify(inputMessage);

    let prettyInputMessage = '';

    if (characterName && msg.isMyself) {
        prettyInputMessage += `${characterName}`;
        if (user.username) {
            prettyInputMessage += ` (${user.username})`;
        }

        prettyInputMessage += ` [${
            getTimeString(new Date(msg.info.date * 1000))
        }]`;

        prettyInputMessage += `:\n`;
    }

    if (!msg.isMyself) {
        prettyInputMessage += `${user.name}`;
        if (user.username) {
            prettyInputMessage += ` (${user.username})`;
        }

        if (replyTo) {
            prettyInputMessage += ` <reply to ${replyTo}>`;
        }

        if (msg.info.forward_origin) {
            const prettyJsonObject = JSON.stringify(removeFieldsWithSuffixes(
                msg.info.forward_origin,
            ));

            if (user.name === 'Telegram') {
                prettyInputMessage +=
                    ` <new post in the channel ${prettyJsonObject}>`;
            } else {
                prettyInputMessage += ` <forward from "${prettyJsonObject}">`;
            }
        }

        if (msg.info.via_bot) {
            prettyInputMessage +=
                ` <this message content generated via bot @${msg.info.via_bot.username}>`;
        }

        if (msg.info.quote?.text) {
            prettyInputMessage += `\n <quoting "${msg.info.quote.text}">`;
        }

        prettyInputMessage += ` [${
            getTimeString(new Date(msg.info.date * 1000))
        }]`;

        prettyInputMessage += `:\n`;
    }

    prettyInputMessage += `${text.trim()}`;

    parts.push({
        type: 'text',
        text: prettyInputMessage,
    });

    if (attachAttachments && role === 'user') {
        let attachments: MessageContent = [];
        try {
            attachments = await getAttachments(api, botInfo.token, msg);
        } catch (error) {
            logger.error(
                'Could not download message attachments: ',
                error,
            );
        }

        if (attachments.length > 0) {
            parts.push(...attachments);
        }
    }

    // FIXME: Types are broken
    return {
        role,
        content: parts,
    } as CoreMessage;
}

export async function makeHistoryV2(
    botInfo: { token: string; id: number },
    api: Api<RawApi>,
    logger: Logger,
    history: ChatMessage[],
    options: HistoryOptions,
): Promise<CoreMessage[]> {
    const { messagesLimit, bytesLimit, symbolLimit } = options;
    const resolveReplies = options.resolveReplyThread ?? true;

    let totalBytes = 0;
    let totalAttachments = 0;
    const prompt: CoreMessage[] = [];
    const addedMessages: number[] = [];

    // Go through history in reverse order
    // to easily add reply threads and attachments
    // prioritizing latest messages
    for (let i = history.length - 1; i >= 0; i--) {
        const msg = history[i];
        let attachAttachments = options.attachments ?? true;

        // If message is too old, don't attach attachments
        if (i < history.length - 10 || totalAttachments > 2) {
            attachAttachments = false;
        }

        // Skip if message is added by reply thread
        if (addedMessages.includes(msg.id)) {
            continue;
        }

        // Add reply thread
        const thread = resolveReplyThread(history, msg);
        for (const msg of thread) {
            let msgRes;

            try {
                msgRes = await constructMsg(
                    api,
                    botInfo,
                    msg,
                    {
                        symbolLimit,
                        attachments: attachAttachments,
                    },
                );
            } catch (error) {
                logger.error(
                    'Could not construct replied message: ',
                    error,
                );
                continue;
            }

            if (Array.isArray(msgRes.content)) {
                const attachmentsPart = msgRes.content.find((m) =>
                    m.type === 'file' || m.type === 'image'
                );

                totalAttachments += attachmentsPart ? 1 : 0;
            }

            const size = JSON.stringify(msgRes).length;

            if (totalBytes + size >= bytesLimit) {
                // logger.info(
                //     `Skipping old messages because prompt is too big ${size} (${
                //         totalBytes + size
                //     } > ${bytesLimit})`,
                // );
                break;
            }

            prompt.push(msgRes);
            addedMessages.push(msg.id);
            totalBytes += size;

            if (!resolveReplies) {
                break;
            }
        }
    }

    // Reverse messages to make them in chronological order
    prompt.reverse();

    // Remove old messages to fit the limit
    prompt.splice(0, prompt.length - messagesLimit);

    return prompt;
}

interface NotesHistoryOptions {
    symbolLimit: number;
    messagesLimit: number;
    bytesLimit: number;
    characterName?: string;
}

export async function makeNotesHistory(
    botInfo: { token: string; id: number },
    api: Api<RawApi>,
    logger: Logger,
    history: ChatMessage[],
    options: NotesHistoryOptions,
): Promise<CoreMessage[]> {
    const { messagesLimit, bytesLimit, symbolLimit, characterName } = options;

    let totalBytes = 0;
    let textPart = '';

    // Go through history in reverse order
    for (let i = history.length - 1; i >= 0; i--) {
        const msg = history[i];

        if (i < history.length - messagesLimit) {
            break;
        }

        let msgRes;
        try {
            msgRes = await constructMsg(
                api,
                botInfo,
                msg,
                {
                    symbolLimit,
                    attachments: false,
                    characterName,
                },
            );
        } catch (error) {
            logger.error('Could not construct message: ', error);
            continue;
        }

        let content = msgRes.content;
        if (Array.isArray(content) && 'text' in content[0]) {
            content = content[0].text;
        }

        if (!content) {
            logger.warn('Message content is empty: ', msgRes);
            continue;
        }

        const size = JSON.stringify(content).length;

        if (totalBytes + size >= bytesLimit) {
            logger.info(
                `Skipping old messages because prompt is too big ${size} (${
                    totalBytes + size
                } > ${bytesLimit})`,
            );

            break;
        }

        textPart += content;

        if (i >= history.length - messagesLimit) {
            textPart += '\n--- ---\n';
        }

        totalBytes += size;
    }

    return [{
        role: 'user',
        content: textPart,
    }];
}

async function getAttachments(
    api: Api<RawApi>,
    token: string,
    msg: ChatMessage | ReplyTo,
): Promise<MessageContent> {
    const parts: MessageContent = [];

    if (msg.info.photo) {
        const size = chooseSize(msg.info.photo);
        try {
            parts.push(
                await getImageContent(api, token, size.file_id, 'image/jpeg'),
            );
        } catch (error) {
            logger.error(
                'Could not download photo: ',
                error,
            );
        }
    }

    if (msg.info.sticker) {
        const { sticker } = msg.info;

        if (sticker.is_video) {
            const file = await downloadFile(
                api,
                token,
                sticker.file_id,
                'video/webm',
            );

            parts.push({
                type: 'file',
                data: file,
                mimeType: 'video/webm',
            });

            return parts;
        }

        let stickerImageId = undefined;
        if (sticker.is_animated) {
            stickerImageId = sticker.thumbnail?.file_id;
        } else {
            stickerImageId = sticker.file_id;
        }

        if (!stickerImageId) {
            logger.warn('Sticker has no file_id: ', sticker);
            return parts;
        }

        try {
            parts.push(
                await getImageContent(api, token, stickerImageId, 'image/webp'),
            );
        } catch (error) {
            logger.error(
                'Could not download sticker: ',
                error,
            );
            return parts;
        }
    }

    // If video < 20mb (non-selfhosted bot api limit)
    // then add whole video to the promt
    // otherwise - just thumbnail
    if (msg.info.video) {
        const video = msg.info.video;
        if (
            video.file_size && video.mime_type &&
            video.file_size <= 1024 * 1024 * 20
        ) {
            const mimeType = video.mime_type;
            const file = await downloadFile(
                api,
                token,
                video.file_id,
                mimeType,
            );

            parts.push({
                type: 'file',
                data: file,
                mimeType: mimeType,
            });
        } else {
            const thumbnailId = msg.info.video.thumbnail?.file_id;
            if (!thumbnailId) {
                logger.warn('Video has no thumbnail: ', msg.info.video);
                return parts;
            }

            try {
                parts.push(
                    await getImageContent(
                        api,
                        token,
                        thumbnailId,
                        'image/jpeg',
                    ),
                );
            } catch (error) {
                logger.error(
                    'Could not download video thumbnail: ',
                    error,
                );
                return parts;
            }
        }
    }

    if (msg.info.animation) {
        const { animation } = msg.info;

        if (!animation.mime_type) {
            logger.warn('Animation has no mime_type: ', animation);
            return parts;
        }

        const mimeType = animation.mime_type;
        const file = await downloadFile(
            api,
            token,
            animation.file_id,
            mimeType,
        );

        parts.push({
            type: 'file',
            data: file,
            mimeType,
        });
    }

    if (msg.info.video_note) {
        const { video_note: viNote } = msg.info;

        const file = await downloadFile(
            api,
            token,
            viNote.file_id,
            'video/mp4',
        );

        parts.push({
            type: 'file',
            data: file,
            mimeType: 'video/mp4',
        });
    }

    if (msg.info.voice) {
        const { voice } = msg.info;

        if (!voice.mime_type) {
            logger.warn('Audio has no mime_type: ', voice);
            return parts;
        }

        const mimeType = voice.mime_type;
        const file = await downloadFile(api, token, voice.file_id, mimeType);

        parts.push({
            type: 'file',
            data: file,
            mimeType,
        });
    }

    return parts;
}
