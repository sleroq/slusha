import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import * as schema from './schema.ts';
import logger from '../logger.ts';

const defaultDbUrl = 'file:./slusha.sqlite';
let singletonDb: ReturnType<typeof createDb>['db'] | undefined;
let singletonClient: ReturnType<typeof createDb>['client'] | undefined;
let sqlitePragmasPromise: Promise<void> | undefined;

export function resolveDbUrl(): string {
    return Deno.env.get('DATABASE_URL') ?? defaultDbUrl;
}

export function createDb() {
    const client = createClient({
        url: resolveDbUrl(),
    });

    const db = drizzle({ client, schema });

    return { db, client };
}

export async function ensureSqlitePragmas() {
    if (!sqlitePragmasPromise) {
        if (!singletonClient) {
            const created = createDb();
            singletonDb = created.db;
            singletonClient = created.client;
        }

        sqlitePragmasPromise = (async () => {
            try {
                await singletonClient!.execute('PRAGMA busy_timeout = 5000;');
            } catch (error) {
                logger.warn('Could not apply SQLite busy_timeout pragma: ', error);
            }
        })();
    }

    await sqlitePragmasPromise;
}

export function getDb() {
    if (!singletonDb) {
        const created = createDb();
        singletonDb = created.db;
        singletonClient = created.client;
    }

    return singletonDb;
}

export type DbClient = ReturnType<typeof createDb>['db'];
