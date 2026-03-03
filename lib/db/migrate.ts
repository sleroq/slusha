import { migrate } from 'drizzle-orm/libsql/migrator';
import logger from '../logger.ts';
import { createDb } from './client.ts';

export async function migrateDb() {
    const { db } = createDb();

    await migrate(db, {
        migrationsFolder: './drizzle',
    });

    logger.info('Database migrations are up to date');
}
