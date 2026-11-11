import { Database } from 'bun:sqlite';
import { expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import { createDb } from './client';
import { importLegacy } from './import-legacy';
import {
    chats,
    chatMembers,
    conversations,
    events,
    optOuts,
    settings,
    summaries,
    updates,
    usage,
    users,
} from './schema';

const databaseUrl = process.env.TEST_DATABASE_URL;

test.skipIf(!databaseUrl)(
    'migrates and imports legacy users, summaries, and opt-outs without history or settings',
    async () => {
        if (!databaseUrl) throw new Error('TEST_DATABASE_URL is required');
        const schema = `legacy_test_${crypto.randomUUID().replaceAll('-', '')}`;
        const admin = postgres(databaseUrl, { max: 1 });
        const directory = await mkdtemp(join(tmpdir(), 'legacy-import-'));
        const sqlitePath = join(directory, 'legacy.sqlite');
        const minimalPath = join(directory, 'minimal.sqlite');
        let close: (() => Promise<void>) | undefined;
        try {
            await admin.unsafe(`CREATE SCHEMA "${schema}"`);
            const url = new URL(databaseUrl);
            url.searchParams.set('options', `-c search_path=${schema}`);
            const connection = createDb(url.toString());
            close = connection.close;
            const { db } = connection;
            const migration = {
                migrationsFolder: join(import.meta.dir, 'migrations'),
                migrationsSchema: schema,
            };
            await migrate(db, migration);
            await migrate(db, migration);

            const sqlite = new Database(sqlitePath);
            try {
                sqlite.exec(`
                CREATE TABLE telegram_users (id INTEGER PRIMARY KEY, username TEXT, first_name TEXT NOT NULL, info TEXT NOT NULL, last_seen INTEGER);
                CREATE TABLE chats (id INTEGER PRIMARY KEY, memory TEXT);
                CREATE TABLE chat_notes (chat_id INTEGER, note_index INTEGER, text TEXT);
                CREATE TABLE chat_opt_out_users (chat_id INTEGER, user_id INTEGER);
                CREATE TABLE messages (id INTEGER, chat_id INTEGER, text TEXT);
                CREATE TABLE settings (key TEXT, value TEXT);
                INSERT INTO telegram_users VALUES (1234567890123, 'alice', 'Alice', '{"language_code":"en","nested":{"ok":true}}', 1700000000000),
                    (42, NULL, 'Bob', '{}', NULL);
                INSERT INTO chats VALUES (-1001234567890, 'remember this'), (-2, ''), (-3, NULL);
                INSERT INTO chat_notes VALUES (-1001234567890, 2, 'second note'), (-1001234567890, 0, 'first note'),
                    (-2, 0, ''), (-3, 0, NULL);
                INSERT INTO chat_opt_out_users VALUES (-1001234567890, 42), (-1001234567890, 1234567890123), (-77, 999);
                INSERT INTO messages VALUES (999, -1001234567890, 'history sentinel');
                INSERT INTO settings VALUES ('ai.model', 'settings sentinel');
            `);
            } finally {
                sqlite.close();
            }

            expect(await importLegacy(db, sqlitePath)).toEqual({
                users: 2,
                summaries: 3,
                optOuts: 3,
            });
            const expectedUsers = [
                { id: 42, username: null, firstName: 'Bob', info: {}, lastSeen: null },
                {
                    id: 1234567890123,
                    username: 'alice',
                    firstName: 'Alice',
                    info: { language_code: 'en', nested: { ok: true } },
                    lastSeen: new Date(1700000000000),
                },
            ];
            const expectedSummaries = [
                { chatId: -1001234567890, kind: 'memory', content: 'remember this' },
                { chatId: -1001234567890, kind: 'note:0', content: 'first note' },
                { chatId: -1001234567890, kind: 'note:2', content: 'second note' },
            ];
            const expectedOptOuts = [
                { chatId: -1001234567890, userId: 42 },
                { chatId: -1001234567890, userId: 1234567890123 },
                { chatId: -77, userId: 999 },
            ];
            expect(await db.select().from(users).orderBy(users.id)).toEqual(expectedUsers);
            expect(await db.select().from(summaries).orderBy(summaries.kind)).toEqual(
                expectedSummaries,
            );
            expect(await db.select().from(optOuts).orderBy(optOuts.chatId, optOuts.userId)).toEqual(
                expectedOptOuts,
            );
            for (const table of [
                chats,
                chatMembers,
                conversations,
                events,
                settings,
                updates,
                usage,
            ]) {
                expect(await db.select().from(table)).toEqual([]);
            }
            expect(await importLegacy(db, sqlitePath)).toEqual({
                users: 0,
                summaries: 0,
                optOuts: 0,
            });
            expect(await db.select().from(users).orderBy(users.id)).toEqual(expectedUsers);
            expect(await db.select().from(summaries).orderBy(summaries.kind)).toEqual(
                expectedSummaries,
            );
            expect(await db.select().from(optOuts).orderBy(optOuts.chatId, optOuts.userId)).toEqual(
                expectedOptOuts,
            );

            const minimal = new Database(minimalPath);
            try {
                minimal.exec(`
                CREATE TABLE telegram_users (id INTEGER PRIMARY KEY, first_name TEXT NOT NULL, info TEXT NOT NULL);
                CREATE TABLE chats (id INTEGER PRIMARY KEY);
                INSERT INTO telegram_users VALUES (77, 'Minimal', '{"source":"minimal"}');
                INSERT INTO chats VALUES (-77);
            `);
            } finally {
                minimal.close();
            }
            expect(await importLegacy(db, minimalPath)).toEqual({
                users: 1,
                summaries: 0,
                optOuts: 0,
            });
            expect(await importLegacy(db, minimalPath)).toEqual({
                users: 0,
                summaries: 0,
                optOuts: 0,
            });
            expect(await db.select().from(users).orderBy(users.id)).toEqual([
                expectedUsers[0],
                {
                    id: 77,
                    username: null,
                    firstName: 'Minimal',
                    info: { source: 'minimal' },
                    lastSeen: null,
                },
                expectedUsers[1],
            ]);
            expect(await db.select().from(summaries).orderBy(summaries.kind)).toEqual(
                expectedSummaries,
            );
            expect(await db.select().from(optOuts).orderBy(optOuts.chatId, optOuts.userId)).toEqual(
                expectedOptOuts,
            );
        } finally {
            if (close) await close();
            await admin.unsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
            await admin.end();
            await rm(directory, { recursive: true, force: true });
        }
    },
);
