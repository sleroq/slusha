import { Logger } from '@deno-library/logger';
import { deleteOldFiles } from '../helpers.ts';
import { getGlobalUserConfig } from '../config.ts';
import { DbClient } from '../db/client.ts';

export function startSchedulers(
    args: { db: DbClient; logger: Logger },
) {
    const { db, logger } = args;

    const filesInterval = setInterval(async () => {
        try {
            const config = await getGlobalUserConfig(db);
            await deleteOldFiles(logger, config.filesMaxAge);
        } catch (error) {
            logger.error('Could not delete old files: ', error);
        }
    }, 60 * 60 * 1000);

    return () => {
        clearInterval(filesInterval);
    };
}
