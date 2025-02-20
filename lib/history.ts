import { Api, RawApi } from 'https://deno.land/x/grammy@v1.30.0/mod.ts';
import { CoreMessage } from 'npm:ai';
import {
    chooseSize,
    downloadFile,
    getImageContent,
    sliceMessage,
} from './helpers.ts';
import { ChatMessage, ReplyTo } from './memory.ts';
import Logger from '@deno-library/logger';

export interface FileContent {
    type: 'file';
    mimeType: string;
    data: Uint8Array;
}

export interface TextPart {
    type: 'text';
    text: string;
}

export interface ImagePart {
    type: 'image';
    image: Uint8Array | URL;
    mimeType?: string;
}

type ContentPart = TextPart | ImagePart | FileContent;

type MessageContent = ContentPart[];

interface HistoryOptions {
    symbolLimit: number;
    messagesLimit: number;
    usernames?: boolean;
    images?: boolean;
}

export async function makeHistory(
    botInfo: { token: string; id: number },
    api: Api<RawApi>,
    logger: Logger,
    history: ChatMessage[],
    options: HistoryOptions,
): Promise<CoreMessage[]> {
    const { symbolLimit, messagesLimit } = options;
    const usernames = options?.usernames ?? true;
    const images = options?.images ?? true;

    if (history.length > messagesLimit) {
        history.splice(0, history.length - messagesLimit);
    }

    const prompt: CoreMessage[] = [];
    for (let i = 0; i < history.length; i++) {
        const msg = history[i];
        const sender = msg.info.from;

        const username = sender?.username ? ` (@${sender.username})` : '';
        const name = sender?.first_name ?? 'User';

        // This is a message passed to ai
        let context = `${name}`;

        if (usernames && username) {
            context += username;
        }

        // If message is a reply add info about it
        if (msg.replyTo) {
            if (msg.replyTo.info.from?.id !== botInfo.id) {
                const replyName = msg.replyTo.info.from?.first_name ?? 'User';
                context += ` (in reply to: ${replyName})`;
            }

            if (msg.replyTo.info.quote?.is_manual) {
                context += ` (quoted) > ${msg.replyTo.info.quote.text}`;
            }
        }

        // If message is reply but not from bot
        // and replied message is not in 5 messages before current one
        // add context about original message so ai can follow conversation
        if (msg.replyTo) {
            const reply = msg.replyTo;
            const prevIndex = i - 5 < 0 ? 0 : i - 5;
            if (
                !history.slice(prevIndex, i).some((msg) => msg.id === reply.id)
            ) {
                const replyName = reply.info.from?.first_name ?? 'User';
                let replyText = `(quoted message from ${replyName}):\n`;
                replyText += sliceMessage(reply.text, symbolLimit);

                const isItFromMe = reply.info.from?.id === botInfo.id;
                if (isItFromMe) {
                    prompt.push(
                        {
                            role: 'assistant',
                            content: replyText,
                        },
                    );
                    // Add attachments only if it's replied by last 3 messages
                    // TODO: Track reply thread
                } else if (
                    history.slice(-3).some((m) => m.id === msg.id) &&
                    !msg.isMyself &&
                    images
                ) {
                    const replyContent: MessageContent = [
                        {
                            type: 'text',
                            text: replyText,
                        },
                    ];

                    let parts: MessageContent = [];
                    try {
                        parts = await getAttachments(
                            api,
                            botInfo.token,
                            logger,
                            reply,
                        );
                    } catch (error) {
                        logger.error(
                            'Could not download reply attachments: ',
                            error,
                        );
                    }

                    prompt.push(
                        {
                            role: 'user',
                            // FIXME: when npm:ai fixes types
                            // @ts-expect-error npm:ai types don't work
                            content: replyContent,
                        },
                    );

                    if (parts.length > 0) {
                        prompt.push(
                            {
                                role: 'user',
                                // FIXME: when npm:ai fixes types
                                // @ts-expect-error npm:ai types don't work
                                content: parts,
                            },
                        );
                    }
                }
            }
        }

        context += ':\n' + sliceMessage(msg.text, symbolLimit);

        if (msg.isMyself) {
            prompt.push({
                role: 'assistant',
                content: [{
                    type: 'text',
                    text: context,
                }],
            });
            continue;
        }

        const content: MessageContent = [
            {
                type: 'text',
                text: context,
            },
        ];

        prompt.push({
            role: 'user',
            // FIXME: when npm:ai fixes types
            // @ts-expect-error npm:ai types don't work
            content,
        });

        // If message is in the last 5 messages in history
        // download image attachments
        if (images && history.slice(-5).some((m) => m.id === msg.id)) {
            const parts = await getAttachments(api, botInfo.token, logger, msg);
            if (parts.length > 0) {
                // content = content.concat(parts);
                prompt.push(
                    {
                        role: 'user',
                        // FIXME: when npm:ai fixes types
                        // @ts-expect-error npm:ai types don't work
                        content: parts,
                    },
                );
            }
        }

    }

    return prompt;
}

async function getAttachments(
    api: Api<RawApi>,
    token: string,
    logger: Logger,
    msg: ChatMessage | ReplyTo,
): Promise<MessageContent> {
    const parts: MessageContent = [];

    if (msg.info.photo) {
        const size = chooseSize(msg.info.photo);
        try {
            parts.push(await getImageContent(api, token, size.file_id));
        } catch (error) {
            logger.error(
                'Could not download photo: ',
                error,
            );
        }
    }

    if (msg.info.sticker) {
        const { sticker } = msg.info;
        let stickerImageId = undefined;
        if (sticker.is_video || sticker.is_animated) {
            stickerImageId = sticker.thumbnail?.file_id;
        } else {
            stickerImageId = sticker.file_id;
        }

        if (!stickerImageId) {
            logger.warn('Sticker has no file_id: ', sticker);
            return parts;
        }

        try {
            parts.push(await getImageContent(api, token, stickerImageId));
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
            false &&
            video.file_size && video.mime_type &&
            video.file_size <= 1024 * 1024 * 20
        ) {
            const file = await downloadFile(api, token, video.file_id);

            parts.push({
                type: 'file',
                mimeType: video.mime_type,
                data: file,
            });
        } else {
            const thumbnailId = msg.info.video.thumbnail?.file_id;
            if (!thumbnailId) {
                logger.warn('Video has no thumbnail: ', msg.info.video);
                return parts;
            }

            try {
                parts.push(await getImageContent(api, token, thumbnailId));
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
        const thumbnailId = msg.info.animation.thumbnail?.file_id;
        if (!thumbnailId) {
            logger.warn('Animation has no file_id: ', msg.info.animation);
            return parts;
        }

        try {
            parts.push(await getImageContent(api, token, thumbnailId));
        } catch (error) {
            logger.error(
                'Could not download animation thumbnail: ',
                error,
            );
            return parts;
        }
    }

    if (msg.info.video_note) {
        const thumbnailId = msg.info.video_note.thumbnail?.file_id;
        if (!thumbnailId) {
            logger.warn('Video note has no file_id: ', msg.info.video_note);
            return parts;
        }

        try {
            parts.push(await getImageContent(api, token, thumbnailId));
        } catch (error) {
            logger.error(
                'Could not download video note thumbnail: ',
                error,
            );
            return parts;
        }
    }

    return parts;
}
