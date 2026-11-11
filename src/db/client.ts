import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

export function createDb(connectionString: string) {
    const client = postgres(connectionString);
    return { db: drizzle(client, { schema }), close: () => client.end() };
}

export type Db = ReturnType<typeof createDb>['db'];
