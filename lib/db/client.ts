import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import * as schema from './schema.ts';

const defaultDbUrl = 'file:./slusha.sqlite';

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

export type DbClient = ReturnType<typeof createDb>['db'];
