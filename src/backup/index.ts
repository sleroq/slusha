import { Database } from 'bun:sqlite';
import { copyFile, lstat, mkdir, mkdtemp, readdir, rename, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';

interface BackupOptions {
    databaseUrl: string;
    dataDir: string;
    backupDir: string;
}

interface RestoreOptions {
    databaseUrl: string;
    dataDir: string;
    backupSet: string;
    replace: boolean;
}

const connectionParameters = new Map(
    Object.entries({
        host: 'PGHOST',
        hostaddr: 'PGHOSTADDR',
        port: 'PGPORT',
        dbname: 'PGDATABASE',
        user: 'PGUSER',
        password: 'PGPASSWORD',
        sslmode: 'PGSSLMODE',
        sslcert: 'PGSSLCERT',
        sslkey: 'PGSSLKEY',
        sslrootcert: 'PGSSLROOTCERT',
        sslcrl: 'PGSSLCRL',
        sslcrldir: 'PGSSLCRLDIR',
        sslpassword: 'PGSSLPASSWORD',
        connect_timeout: 'PGCONNECT_TIMEOUT',
        application_name: 'PGAPPNAME',
        options: 'PGOPTIONS',
        service: 'PGSERVICE',
        target_session_attrs: 'PGTARGETSESSIONATTRS',
        gssencmode: 'PGGSSENCMODE',
        channel_binding: 'PGCHANNELBINDING',
    }),
);

function connectionEnvironment(databaseUrl: string): NodeJS.ProcessEnv {
    let url: URL;
    try {
        url = new URL(databaseUrl);
    } catch {
        throw new Error('Invalid PostgreSQL URL');
    }
    if (url.protocol !== 'postgres:' && url.protocol !== 'postgresql:')
        throw new Error('Expected a PostgreSQL URL');
    const env = Object.fromEntries(
        Object.entries(process.env).filter(([key]) => !key.startsWith('PG')),
    );
    if (url.hostname) env.PGHOST = decodeURIComponent(url.hostname);
    if (url.port) env.PGPORT = url.port;
    if (url.pathname.length > 1) env.PGDATABASE = decodeURIComponent(url.pathname.slice(1));
    if (url.username) env.PGUSER = decodeURIComponent(url.username);
    if (url.password) env.PGPASSWORD = decodeURIComponent(url.password);
    for (const [key, value] of url.searchParams) {
        const name = connectionParameters.get(key);
        if (!name) throw new Error(`Unsupported PostgreSQL URL parameter: ${key}`);
        env[name] = value;
    }
    return env;
}

async function runPostgres(command: string, args: string[], databaseUrl: string) {
    const process = Bun.spawn([command, ...args], {
        env: connectionEnvironment(databaseUrl),
        stdout: 'ignore',
        stderr: 'ignore',
    });
    if ((await process.exited) !== 0)
        throw new Error(`${command} failed; check the connection and database permissions`);
}

async function entries(path: string) {
    try {
        return await readdir(path, { withFileTypes: true });
    } catch (error) {
        if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return [];
        throw error;
    }
}

async function snapshotSessions(source: string, target: string) {
    await mkdir(target);
    for (const entry of await entries(source)) {
        if (!entry.name.endsWith('.sqlite')) continue;
        if (!entry.isFile()) throw new Error(`Session is not a regular file: ${entry.name}`);
        const db = new Database(join(source, entry.name), { readonly: true });
        try {
            db.query('VACUUM INTO ?').run(join(target, entry.name));
        } finally {
            db.close();
        }
    }
}

async function copyWorkspaces(source: string, target: string) {
    await mkdir(target);
    for (const entry of await entries(source)) {
        if (!entry.name.endsWith('.json')) continue;
        if (!entry.isFile()) throw new Error(`Workspace is not a regular file: ${entry.name}`);
        await copyFile(join(source, entry.name), join(target, entry.name));
    }
}

export async function createBackup({
    databaseUrl,
    dataDir,
    backupDir,
}: BackupOptions): Promise<string> {
    await mkdir(backupDir, { recursive: true });
    const temporary = await mkdtemp(join(resolve(backupDir), '.backup-'));
    const completed = join(
        resolve(backupDir),
        `backup-${new Date().toISOString().replaceAll(':', '-')}-${crypto.randomUUID()}`,
    );
    try {
        await snapshotSessions(join(dataDir, 'sessions'), join(temporary, 'sessions'));
        await copyWorkspaces(join(dataDir, 'workspaces'), join(temporary, 'workspaces'));
        await runPostgres(
            'pg_dump',
            ['--no-password', '--format=custom', '--file', join(temporary, 'postgres.dump')],
            databaseUrl,
        );
        await rename(temporary, completed);
        return completed;
    } finally {
        await rm(temporary, { recursive: true, force: true });
    }
}

export function scheduleBackups(options: BackupOptions, intervalMs = 60_000, keep = 10) {
    let running: Promise<void> | undefined;
    const timer = setInterval(() => {
        if (running) return;
        running = createBackup(options)
            .then(async () => {
                const backups = (await entries(options.backupDir))
                    .filter(
                        (entry) =>
                            entry.isDirectory() &&
                            /^backup-\d{4}-\d\d-\d\dT\d\d-\d\d-\d\d\.\d{3}Z-[0-9a-f-]{36}$/.test(
                                entry.name,
                            ),
                    )
                    .map((entry) => entry.name)
                    .sort()
                    .reverse();
                for (const name of backups.slice(keep))
                    await rm(join(options.backupDir, name), { recursive: true, force: true });
            })
            .catch((error) => console.error('Backup failed:', error))
            .finally(() => {
                running = undefined;
            });
    }, intervalMs);
    return async () => {
        clearInterval(timer);
        await running;
    };
}

export async function restoreBackup({
    databaseUrl,
    dataDir,
    backupSet,
    replace,
}: RestoreOptions): Promise<void> {
    if (!replace)
        throw new Error('Restore requires explicit replacement consent and a stopped application');
    for (const name of ['sessions', 'workspaces', 'postgres.dump']) {
        const info = await lstat(join(backupSet, name));
        if (name === 'postgres.dump' && !info.isFile())
            throw new Error(`Invalid backup set: ${name}`);
        if (name !== 'postgres.dump' && !info.isDirectory())
            throw new Error(`Invalid backup set: ${name}`);
    }

    // Stage files before changing either destination; do not restore SQLite WAL sidecars.
    await mkdir(dataDir, { recursive: true });
    const staged = await mkdtemp(join(resolve(dataDir), '.restore-'));
    try {
        await mkdir(join(staged, 'sessions'));
        for (const entry of await entries(join(backupSet, 'sessions'))) {
            if (!entry.isFile() || !entry.name.endsWith('.sqlite'))
                throw new Error(`Invalid session backup: ${entry.name}`);
            await copyFile(
                join(backupSet, 'sessions', entry.name),
                join(staged, 'sessions', entry.name),
            );
        }
        await copyWorkspaces(join(backupSet, 'workspaces'), join(staged, 'workspaces'));

        await runPostgres(
            'pg_restore',
            [
                '--no-password',
                '--clean',
                '--if-exists',
                '--no-owner',
                '--no-privileges',
                '--exit-on-error',
                '--single-transaction',
                '--dbname',
                '',
                join(backupSet, 'postgres.dump'),
            ],
            databaseUrl,
        );

        for (const name of ['sessions', 'workspaces']) {
            await rm(join(dataDir, name), { recursive: true, force: true });
            await rename(join(staged, name), join(dataDir, name));
        }
    } finally {
        await rm(staged, { recursive: true, force: true });
    }
}
