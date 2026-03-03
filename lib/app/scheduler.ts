import { Logger } from '@deno-library/logger';
import { deleteOldFiles } from '../helpers.ts';
import { Memory } from '../memory.ts';
import { Config } from '../config.ts';

export function startSchedulers(
    args: { memory: Memory; config: Config; logger: Logger },
) {
    const { config, logger } = args;

    const filesInterval = setInterval(async () => {
        try {
            await deleteOldFiles(logger, config.filesMaxAge);
        } catch (error) {
            logger.error('Could not delete old files: ', error);
        }
    }, 60 * 60 * 1000);

    return () => {
        clearInterval(filesInterval);
    };
}
