import {
    Sticker,
    Update,
} from 'https://deno.land/x/grammy@v1.30.0/types.deno.ts';
import {
    Message,
    PhotoSize,
} from 'https://deno.land/x/grammy_types@v3.14.0/message.ts';
import { Config } from './config.ts';
import {
    CoreMessage,
} from 'npm:ai';
import { exists } from 'https://deno.land/x/logger@v1.1.1/fs.ts';
import ky from 'https://esm.sh/ky@1.7.2';
import { ReplyMessage } from './telegram/helpers.ts';
import { Api, RawApi } from 'https://deno.land/x/grammy@v1.30.0/mod.ts';
import { Logger } from '@deno-library/logger';
import { ImagePart } from './history.ts';

export function getRandomInt(min: number, max: number) {
    min = Math.ceil(min);
    max = Math.floor(max);
    return Math.floor(Math.random() * (max - min) + min); // The maximum is exclusive and the minimum is inclusive
}

export function stickerToText({ emoji }: Sticker): string {
    return emoji ? `[Sticker ${emoji}]` : '[Sticker]';
}

export function removeBotName(
    response: string,
    name: string,
    username: string,
) {
    const regexFull = new RegExp(`^${name}\\s*\\(@${username}\\):\\s*`, 'gmi');
    const regexName = new RegExp(`^${name}\\s*:\\s*`, 'gmi');
    response = response.replace(regexFull, '');
    return response.replace(regexName, '');
}

export function fixAIResponse(response: string) {
    // Delete first line if it ends with "):"
    const replyLines = response.split('\n');
    const firstLint = replyLines[0];
    if (firstLint.match(/^.*\)\s*:\s*$/)) {
        response = replyLines.slice(1).join('\n');
    }

    return response.trim();
}

export function sliceMessage(message: string, maxLength: number): string {
    return message.length > maxLength
        ? message.slice(0, maxLength) + '...'
        : message;
}

export async function downloadFile(api: Api<RawApi>, token: string, fileId: string) {
    const filePath = `./tmp/${fileId}`;
    if (await exists(filePath)) {
        return await Deno.readFile(filePath);
    }

    const file = await api.getFile(fileId);

    const downloadUrl =
        `https://api.telegram.org/file/bot${token}/${file.file_path}`;

    const arrayBuffer = await ky.get(downloadUrl).arrayBuffer();
    const buffer = new Uint8Array(arrayBuffer);

    await Deno.writeFile(filePath, buffer);

    return buffer;
}

export async function getImageContent(
    api: Api<RawApi>,
    token: string,
    fileId: string,
): Promise<ImagePart> {
    const file = await downloadFile(api, token, fileId);

    return {
        type: 'image',
        image: file,
    };
}

export function chooseSize(photos: PhotoSize[]): PhotoSize {
    return photos.sort((a, b) => {
        if (!a.file_size || !b.file_size) {
            return 0;
        }

        if (a.file_size > b.file_size) {
            return -1;
        }

        if (a.file_size < b.file_size) {
            return 1;
        }

        return 0;
    })[0];
}

/**
 * Deletes old files from tmp folder
 * @param logger Logger
 * @param maxAge Max age in hours
 */
export async function deleteOldFiles(logger: Logger, maxAge: number) {
    const files = Deno.readDir('./tmp');

    for await (const file of files) {
        const filePath = `./tmp/${file.name}`;

        const stat = await Deno.stat(filePath);

        const mtime = stat.mtime?.getTime() ?? 0;
        const age = (Date.now() - mtime) / (1000 * 60 * 60);

        if (age > maxAge || stat.mtime === null) {
            logger.info(`Deleting old file: ${file.name}`);
            await Deno.remove(filePath);
        }
    }
}

export function getText(
    msg:
        | Message
        | ReplyMessage,
) {
    let text = msg.text || '';

    if (msg.sticker) {
        text += stickerToText(msg.sticker);
    }

    if (msg.caption) {
        text += msg.caption;
    }

    // Replace new lines with spaces
    text = text.replace(/[\n\r]/g, ' ');

    if (!text.trim()) return;

    let name = '';
    switch (msg.forward_origin?.type) {
        case 'user':
            name = msg.forward_origin.sender_user.first_name ?? '';
            break;
        case 'chat':
            name = msg.forward_origin.sender_chat.first_name ??
                msg.forward_origin.sender_chat.title ?? '';
            break;
        case 'channel':
            name = msg.forward_origin.chat.first_name ??
                msg.forward_origin.chat.title ?? '';
            break;
        case 'hidden_user':
            name = 'hidden';
            break;
    }

    const from = name !== '' ? `(forwarded from ${name.slice(0, 20)}): ` : '';
    text = from + text;

    const attachments: (keyof (Message & Update.NonChannel))[] = [
        'photo',
        'video',
        'animation',
        'audio',
        'voice',
        'document',
        'video_note',
        'contact',
        'location',
        'venue',
        'poll',
        'dice',
        'game',
    ];

    const attachmentsText = attachments.reduce((acc, key) => {
        if (msg[key]) {
            acc += ` [${key}]`;
        }

        return acc;
    }, '');

    text += attachmentsText;

    return text;
}

export function getRandomNepon(config: Config) {
    const nepons = config.nepons;
    const randomIndex = getRandomInt(0, nepons.length - 1);
    return nepons[randomIndex];
}

/**
 * Returns true with probability of `percentage`
 * @param percentage
 * @returns boolean
 * @throws Error if `percentage` is not between 0 and 100
 */
export function probability(percentage: number) {
    if (percentage < 0 || percentage > 100) {
        throw new Error('Percentage must be between 0 and 100');
    }

    return Math.random() < percentage / 100;
}

export function testMessage(regexs: Array<string | RegExp>, text: string) {
    return regexs.some((regex) => {
        if (typeof regex === 'string') {
            return text.includes(regex);
        }

        return regex.test(text);
    });
}

export function prettyPrintPrompt(prompt: CoreMessage[], limit = 100) {
    return prompt.map((message) => {
        if (typeof message.content === 'string') {
            return message.role + ': ' + message.content;
        }

        return message.role + ': ' + message.content.map((content) => {
            if ('text' in content) {
                return content.text.replaceAll('\n', ' ');
            }

            if ('image' in content) {
                return '[image]';
            }

            if ('file' in content) {
                return '[file]';
            }
        }).join('\n');
    }).slice(-limit).join('\n');
}

export function escapeHtml(unsafe: string): string {
    return unsafe
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}
