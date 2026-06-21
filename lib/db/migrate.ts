import { migrate } from 'drizzle-orm/libsql/migrator';
import logger from '../logger.ts';
import { getDb, initializeDb } from './client.ts';

export async function migrateDb() {
    await initializeDb();
    const db = getDb();

    await migrate(db, {
        migrationsFolder: './drizzle',
    });

    logger.info('Database migrations are up to date');
}
