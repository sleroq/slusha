import { Database } from 'bun:sqlite';
import { expect, test } from 'bun:test';
import { mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import postgres from 'postgres';
import { createBackup, restoreBackup, scheduleBackups } from './index';

const databaseUrl = process.env.TEST_DATABASE_URL;
const available = databaseUrl && Bun.which('pg_dump') && Bun.which('pg_restore');

test.skipIf(!available)(
    'backs up live WAL and PostgreSQL and restores a selected set',
    async () => {
        if (!databaseUrl) throw new Error('TEST_DATABASE_URL is required');

        const dir = await mkdtemp(join(tmpdir(), 'backup-test-'));
        const sourceName = `backup_source_${crypto.randomUUID().replaceAll('-', '')}`;
        const targetName = `backup_target_${crypto.randomUUID().replaceAll('-', '')}`;
        const admin = postgres(databaseUrl, { max: 1 });
        const sourceUrl = new URL(databaseUrl);
        sourceUrl.pathname = `/${sourceName}`;
        const targetUrl = new URL(databaseUrl);
        targetUrl.pathname = `/${targetName}`;
        let source: ReturnType<typeof postgres> | undefined;
        let target: ReturnType<typeof postgres> | undefined;
        let sqlite: Database | undefined;
        try {
            await admin.unsafe(`CREATE DATABASE "${sourceName}"`);
            await admin.unsafe(`CREATE DATABASE "${targetName}"`);
            source = postgres(sourceUrl.toString());
            target = postgres(targetUrl.toString());
            await source`CREATE TABLE events (value text)`;
            await source`INSERT INTO events VALUES ('before')`;
            const dataDir = join(dir, 'data');
            const backupDir = join(dir, 'backups');
            await mkdir(join(dataDir, 'sessions'), { recursive: true });
            await mkdir(join(dataDir, 'workspaces'));
            sqlite = new Database(join(dataDir, 'sessions', '1_2.sqlite'));
            sqlite.exec(
                "PRAGMA journal_mode=WAL; PRAGMA wal_autocheckpoint=0; CREATE TABLE events (value TEXT); INSERT INTO events VALUES ('before');",
            );
            expect(Bun.file(join(dataDir, 'sessions', '1_2.sqlite-wal')).size).toBeGreaterThan(0);
            await writeFile(join(dataDir, 'workspaces', '1_2.tar'), 'original workspace');
            const backupSet = await createBackup({
                databaseUrl: sourceUrl.toString(),
                dataDir,
                backupDir,
            });
            await source`INSERT INTO events VALUES ('after')`;
            sqlite.exec("INSERT INTO events VALUES ('after')");
            await writeFile(join(dataDir, 'workspaces', '1_2.tar'), 'changed workspace');
            const restoredDir = join(dir, 'restored');
            expect(
                restoreBackup({
                    databaseUrl: targetUrl.toString(),
                    dataDir: restoredDir,
                    backupSet,
                    replace: false,
                }),
            ).rejects.toThrow('explicit replacement');
            await target`CREATE TABLE events (value text)`;
            await target`INSERT INTO events VALUES ('old target')`;
            await restoreBackup({
                databaseUrl: targetUrl.toString(),
                dataDir: restoredDir,
                backupSet,
                replace: true,
            });
            expect([...(await target`SELECT value FROM events`)]).toEqual([{ value: 'before' }]);
            const restored = new Database(join(restoredDir, 'sessions', '1_2.sqlite'), {
                readonly: true,
            });
            try {
                expect(restored.query('SELECT value FROM events').all()).toEqual([
                    { value: 'before' },
                ]);
            } finally {
                restored.close();
            }
            expect(await readFile(join(restoredDir, 'workspaces', '1_2.tar'), 'utf8')).toBe(
                'original workspace',
            );
            await symlink(
                join(dataDir, 'workspaces', '1_2.tar'),
                join(dataDir, 'workspaces', 'bad.tar'),
            );
            expect(
                createBackup({ databaseUrl: sourceUrl.toString(), dataDir, backupDir }),
            ).rejects.toThrow('not a regular file');
            expect(await readdir(backupDir)).toEqual([backupSet.split('/').at(-1)!]);
            const cli = Bun.spawn(
                [
                    'bun',
                    join(import.meta.dir, 'cli.ts'),
                    'backup',
                    '--data-dir',
                    dataDir,
                    '--backup-dir',
                    backupDir,
                ],
                {
                    env: { ...process.env, DATABASE_URL: sourceUrl.toString() },
                    stdout: 'pipe',
                    stderr: 'pipe',
                },
            );
            const output =
                (await new Response(cli.stdout).text()) + (await new Response(cli.stderr).text());
            expect(await cli.exited).not.toBe(0);
            expect(output).not.toContain(decodeURIComponent(sourceUrl.password));
            await rm(join(dataDir, 'workspaces', 'bad.tar'));
            const stop = scheduleBackups(
                { databaseUrl: sourceUrl.toString(), dataDir, backupDir },
                50,
                2,
            );
            const observed = new Set<string>();
            try {
                const deadline = Date.now() + 10_000;
                while (observed.size < 3) {
                    for (const name of await readdir(backupDir))
                        if (name.startsWith('backup-')) observed.add(name);
                    if (Date.now() > deadline)
                        throw new Error('Timed out waiting for scheduled backups');
                    await Bun.sleep(20);
                }
            } finally {
                await stop();
            }
            expect(
                (await readdir(backupDir)).filter((name) => name.startsWith('backup-')).length,
            ).toBeLessThanOrEqual(2);

            for (let i = 0; i < 11; i++) {
                await mkdir(
                    join(
                        backupDir,
                        `backup-2000-01-01T00-00-${String(i).padStart(2, '0')}.000Z-${crypto.randomUUID()}`,
                    ),
                );
            }
            const stopDefault = scheduleBackups(
                { databaseUrl: sourceUrl.toString(), dataDir, backupDir },
                50,
            );
            try {
                const deadline = Date.now() + 10_000;
                while (
                    (await readdir(backupDir)).filter((name) => name.startsWith('backup-')).length >
                    10
                ) {
                    if (Date.now() > deadline)
                        throw new Error('Timed out waiting for default retention');
                    await Bun.sleep(20);
                }
            } finally {
                await stopDefault();
            }
            expect(
                (await readdir(backupDir)).filter((name) => name.startsWith('backup-')).length,
            ).toBe(10);
        } finally {
            sqlite?.close();
            await source?.end();
            await target?.end();
            await admin.unsafe(`DROP DATABASE IF EXISTS "${sourceName}"`);
            await admin.unsafe(`DROP DATABASE IF EXISTS "${targetName}"`);
            await admin.end();
            await rm(dir, { recursive: true, force: true });
        }
    },
    30000,
);
