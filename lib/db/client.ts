import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import * as schema from './schema.ts';
import logger from '../logger.ts';

const defaultDbUrl = 'file:./slusha.sqlite';
let singletonDb: ReturnType<typeof createDb>['db'] | undefined;
let singletonClient: ReturnType<typeof createDb>['client'] | undefined;
let initializeDbPromise: Promise<void> | undefined;

export function resolveDbUrl(): string {
    return Deno.env.get('DATABASE_URL') ?? defaultDbUrl;
}

export function createDb() {
    const client = createClient({
        url: resolveDbUrl(),
        timeout: 5000,
    });

    const db = drizzle({ client, schema });

    return { db, client };
}

function ensureDbCreated() {
    if (!singletonClient) {
        const created = createDb();
        singletonDb = created.db;
        singletonClient = created.client;
    }
}

export async function initializeDb() {
    if (!initializeDbPromise) {
        initializeDbPromise = (async () => {
            ensureDbCreated();

            try {
                await singletonClient!.execute('PRAGMA foreign_keys = ON;');
                await singletonClient!.execute('PRAGMA journal_mode = WAL;');
                await singletonClient!.execute('PRAGMA busy_timeout = 5000;');
            } catch (error) {
                logger.warn('Could not apply SQLite pragmas: ', error);
            }
        })();
    }

    await initializeDbPromise;
}

export function getDb() {
    ensureDbCreated();

    return singletonDb!;
}

export type DbClient = ReturnType<typeof createDb>['db'];
