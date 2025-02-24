import { Config } from './config.ts';
import ky from 'ky';
import { Api, RawApi } from 'grammy';
import { Logger } from '@deno-library/logger';
import { ImagePart, supportedTypesMap } from './history.ts';
import { exists } from '@std/fs';
import { Message, PhotoSize, Sticker } from 'grammy_types';

export function getRandomInt(min: number, max: number) {
    min = Math.ceil(min);
    max = Math.floor(max);
    return Math.floor(Math.random() * (max - min) + min); // The maximum is exclusive and the minimum is inclusive
}

export function stickerToText({ emoji }: Sticker): string {
    return emoji ? `[Sticker ${emoji}]` : '[Sticker]';
}

export function sliceMessage(message: string, maxLength: number): string {
    return message.length > maxLength
        ? message.slice(0, maxLength) + '...'
        : message;
}

export async function downloadFile(
    api: Api<RawApi>,
    token: string,
    fileId: string,
) {
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

export function escapeHtml(unsafe: string): string {
    return unsafe
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

export function msgTypeSupported(msg: Message) {
    for (const [type] of supportedTypesMap) {
        if (msg[type] !== undefined) {
            return true;
        }
    }
}

