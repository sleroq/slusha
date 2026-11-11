import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { createDb, type Db } from './client';

export async function migrateDb(db: Db) {
    await migrate(db, { migrationsFolder: `${import.meta.dir}/migrations` });
}

if (import.meta.main) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error('DATABASE_URL is required');
    const { db, close } = createDb(connectionString);
    try {
        await migrateDb(db);
    } finally {
        await close();
    }
}
