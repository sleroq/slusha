import { assertEquals } from '@std/assert';
import { sql } from 'drizzle-orm';
import { createDb } from './client.ts';

Deno.test('local database serializes concurrent transactions and statements', async () => {
    const path = await Deno.makeTempFile({ suffix: '.sqlite' });
    const { db, client } = createDb(`file:${path}`);

    try {
        await db.run(sql`create table counters (value integer not null)`);

        await Promise.all(Array.from({ length: 20 }, async (_, value) => {
            await db.transaction(async (tx) => {
                await tx.run(sql`insert into counters values (${value})`);
                await tx.run(
                    sql`update counters set value = value + 1 where value = ${value}`,
                );
            });
            await db.run(sql`insert into counters values (${value + 100})`);
        }));

        const rows = await db.all<{ count: number }>(
            sql`select count(*) as count from counters`,
        );
        assertEquals(rows[0]?.count, 40);
    } finally {
        client.close();
        await Deno.remove(path);
    }
});
