import { migrate } from 'drizzle-orm/libsql/migrator';
import logger from '../logger.ts';
import { ensureSqlitePragmas, getDb } from './client.ts';

export async function migrateDb() {
    await ensureSqlitePragmas();
    const db = getDb();

    await migrate(db, {
        migrationsFolder: './drizzle',
    });

    logger.info('Database migrations are up to date');
}
