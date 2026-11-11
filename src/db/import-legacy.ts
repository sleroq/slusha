import { Database } from 'bun:sqlite';
import { createDb, type Db } from './client';
import { optOuts, summaries, users } from './schema';

type LegacyUser = {
    id: number;
    username: string | null;
    first_name: string;
    info: string;
    last_seen: number | null;
};

type LegacySummary = { chat_id: number; kind: string; content: string };
type LegacyOptOut = { chat_id: number; user_id: number };

export async function importLegacy(db: Db, sqlitePath: string) {
    const sqlite = new Database(sqlitePath, { readonly: true });
    try {
        function columns(table: string) {
            return new Set(
                sqlite
                    .query<{ name: string }, [string]>('SELECT name FROM pragma_table_info(?)')
                    .all(table)
                    .map((column) => column.name),
            );
        }
        const userColumns = columns('telegram_users');
        const chatColumns = columns('chats');
        const noteColumns = columns('chat_notes');
        const optOutColumns = columns('chat_opt_out_users');

        return await db.transaction(async (tx) => {
            let userCount = 0;
            let summaryCount = 0;
            let optOutCount = 0;

            if (['id', 'first_name', 'info'].every((column) => userColumns.has(column))) {
                let username = 'NULL AS username';
                let lastSeen = 'NULL AS last_seen';
                if (userColumns.has('username')) username = 'username';
                if (userColumns.has('last_seen')) lastSeen = 'last_seen';
                const rows = sqlite.query<LegacyUser, []>(
                    `SELECT id, ${username}, first_name, info, ${lastSeen} FROM telegram_users`,
                );
                for (const row of rows.iterate()) {
                    let lastSeenAt = null;
                    if (row.last_seen) lastSeenAt = new Date(row.last_seen);
                    const inserted = await tx
                        .insert(users)
                        .values({
                            id: row.id,
                            username: row.username,
                            firstName: row.first_name,
                            info: JSON.parse(row.info),
                            lastSeen: lastSeenAt,
                        })
                        .onConflictDoNothing()
                        .returning({ id: users.id });
                    userCount += inserted.length;
                }
            }

            if (chatColumns.has('id') && chatColumns.has('memory')) {
                const rows = sqlite.query<LegacySummary, []>(
                    "SELECT id AS chat_id, 'memory' AS kind, memory AS content FROM chats WHERE memory IS NOT NULL AND memory <> ''",
                );
                for (const row of rows.iterate()) {
                    const inserted = await tx
                        .insert(summaries)
                        .values({ chatId: row.chat_id, kind: row.kind, content: row.content })
                        .onConflictDoNothing()
                        .returning({ chatId: summaries.chatId });
                    summaryCount += inserted.length;
                }
            }

            if (['chat_id', 'note_index', 'text'].every((column) => noteColumns.has(column))) {
                const rows = sqlite.query<LegacySummary, []>(
                    "SELECT chat_id, 'note:' || note_index AS kind, text AS content FROM chat_notes WHERE text IS NOT NULL AND text <> '' ORDER BY chat_id, note_index",
                );
                for (const row of rows.iterate()) {
                    const inserted = await tx
                        .insert(summaries)
                        .values({ chatId: row.chat_id, kind: row.kind, content: row.content })
                        .onConflictDoNothing()
                        .returning({ chatId: summaries.chatId });
                    summaryCount += inserted.length;
                }
            }

            if (optOutColumns.has('chat_id') && optOutColumns.has('user_id')) {
                const rows = sqlite.query<LegacyOptOut, []>(
                    'SELECT chat_id, user_id FROM chat_opt_out_users',
                );
                for (const row of rows.iterate()) {
                    const inserted = await tx
                        .insert(optOuts)
                        .values({ chatId: row.chat_id, userId: row.user_id })
                        .onConflictDoNothing()
                        .returning({ chatId: optOuts.chatId });
                    optOutCount += inserted.length;
                }
            }

            return { users: userCount, summaries: summaryCount, optOuts: optOutCount };
        });
    } finally {
        sqlite.close();
    }
}

if (import.meta.main) {
    const connectionString = process.env.DATABASE_URL;
    const sqlitePath = process.argv[2];
    if (!connectionString || !sqlitePath)
        throw new Error('Usage: DATABASE_URL=... bun src/db/import-legacy.ts <sqlite-path>');
    const { db, close } = createDb(connectionString);
    try {
        console.log(await importLegacy(db, sqlitePath));
    } finally {
        await close();
    }
}
