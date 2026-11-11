import { expect, test } from 'bun:test';
import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { sign } from '@tma.js/init-data-node/web';
import postgres from 'postgres';
import { z } from 'zod';
import { configResponseSchema } from '../shared/config-contract';

const enabled = process.env.RUN_LIVE_GENERATION_TESTS === '1' && !!process.env.OPENCODE_API_KEY && !!process.env.TEST_DATABASE_URL;
const token = '123456:synthetic-local-token';
const chatId = 424242;
const containerImage = process.env.LIVE_APP_CONTAINER_IMAGE;
const systemdService = process.env.LIVE_APP_SYSTEMD_SERVICE;
const systemdEnvFile = process.env.LIVE_APP_SYSTEMD_ENV_FILE;
let timeout = 300_000;
if (containerImage || systemdService) timeout = 480_000;

test.skipIf(!enabled)('real app generates replies and retains durable context across restart', async () => {
    const databaseUrl = process.env.TEST_DATABASE_URL!;
    const admin = postgres(databaseUrl, { max: 1 });
    const database = `slusha_live_${crypto.randomUUID().replaceAll('-', '')}`;
    if (systemdService && (!systemdEnvFile || containerImage)) throw new Error('Systemd test needs its own environment file and no container image');
    let dir = join('/var/lib/slusha', `live-${crypto.randomUUID()}`);
    if (!systemdService) dir = await mkdtemp(join(tmpdir(), 'slusha-app-live-'));
    const updates: { update_id: number; message: object }[] = [];
    const sent: { chat_id: number; text: string; reply_parameters?: { message_id: number } }[] = [];
    const bot = { id: 123456, is_bot: true, first_name: 'Synthetic Bot', username: 'synthetic_bot' };
    const fake = Bun.serve({ hostname: '127.0.0.1', port: 0, async fetch(request) {
        const method = new URL(request.url).pathname.split('/').at(-1);
        const body: unknown = await request.json();
        if (method === 'getMe') return Response.json({ ok: true, result: bot });
        if (method === 'getUpdates') {
            const { offset } = z.object({ offset: z.number().optional() }).parse(body);
            await Bun.sleep(100);
            return Response.json({ ok: true, result: updates.filter((update) => update.update_id >= (offset ?? 0)) });
        }
        if (method === 'sendMessage') {
            const message = z.object({ chat_id: z.number(), text: z.string(), reply_parameters: z.object({ message_id: z.number() }).optional() }).parse(body);
            sent.push(message);
            return Response.json({ ok: true, result: { message_id: 1000 + sent.length, date: Math.floor(Date.now() / 1000), chat: { id: chatId, type: 'private' }, from: bot, text: message.text } });
        }
        if (method === 'sendChatAction') return Response.json({ ok: true, result: true });
        return Response.json({ ok: false, error_code: 400, description: 'Unexpected method' });
    } });
    const reservation = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch: () => new Response() });
    const port = reservation.port;
    reservation.stop();
    const url = new URL(databaseUrl);
    url.pathname = `/${database}`;
    let app: ReturnType<typeof Bun.spawn> | undefined;
    let created = false;
    let db: ReturnType<typeof postgres> | undefined;
    const container = `slusha-live-${crypto.randomUUID()}`;
    let stopping: Promise<void> | undefined;
    let serviceStarted = false;
    const dockerEnv = { ...process.env, DOCKER_HOST: 'unix:///var/run/docker.sock', DOCKER_CONTEXT: '', DOCKER_DEFAULT_PLATFORM: '' };

    function onSigterm() {
        void stop().finally(() => process.exit(143));
    }
    if (containerImage || systemdService) process.once('SIGTERM', onSigterm);

    async function waitFor(predicate: () => Promise<boolean>, label: string, timeout = 120_000) {
        const deadline = Date.now() + timeout;
        while (Date.now() < deadline) {
            if (app && app.exitCode !== null) throw new Error(`App exited while waiting for ${label}`);
            if (await predicate()) return;
            await Bun.sleep(200);
        }
        throw new Error(`Timed out waiting for ${label}`);
    }
    function expectNoNetAdmin(status: string) {
        const capabilities = status.match(/^CapEff:\s*([0-9a-f]+)$/m)?.[1];
        if (!capabilities) throw new Error('Unable to read service capabilities');
        expect(BigInt(`0x${capabilities}`) & (1n << 12n)).toBe(0n);
    }
    async function systemctl(...args: string[]) {
        const process = Bun.spawn(['systemctl', ...args], { stdout: 'pipe', stderr: 'pipe' });
        const output = await new Response(process.stdout).text();
        const error = await new Response(process.stderr).text();
        if (await process.exited !== 0) throw new Error(`systemctl failed: ${error}`);
        return output.trim();
    }
    async function start() {
        const env = {
            ...process.env, BOT_TOKEN: token, DATABASE_URL: url.toString(), DATA_DIR: dir,
            TELEGRAM_API_ROOT: `http://127.0.0.1:${fake.port}`, WEB_HOST: '127.0.0.1', WEB_PORT: String(port),
            SANDBOX_ENABLED: 'false', DEFAULT_MODEL: process.env.LIVE_MODEL || 'minimax-m3',
            LANGFUSE_PUBLIC_KEY: '', LANGFUSE_SECRET_KEY: '',
        };
        if (systemdService && systemdEnvFile) {
            const variables = {
                BOT_TOKEN: token, OPENCODE_API_KEY: process.env.OPENCODE_API_KEY!, DATABASE_URL: url.toString(),
                DATA_DIR: dir, BACKUP_DIR: join(dir, 'backups'), TELEGRAM_API_ROOT: env.TELEGRAM_API_ROOT,
                WEB_HOST: env.WEB_HOST, WEB_PORT: env.WEB_PORT, SANDBOX_ENABLED: 'true', DEFAULT_MODEL: env.DEFAULT_MODEL,
            };
            await mkdir(dirname(systemdEnvFile), { recursive: true, mode: 0o700 });
            const lines = Object.entries(variables).map(([name, value]) => `${name}=${JSON.stringify(value)}`).join('\n');
            await writeFile(systemdEnvFile, `${lines}\n`, { mode: 0o600 });
            await systemctl('start', systemdService);
            serviceStarted = true;
        } else if (containerImage) {
            if (process.platform !== 'linux') throw new Error('Container live test requires a provisioned Linux host');
            app = Bun.spawn(['docker', 'run', '--rm', '--name', container, '--user', 'root', '--network', 'host',
                '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges',
                '-v', '/run/slusha-gvisor:/run/slusha-gvisor:ro',
                '-v', `${dir}:${dir}`, '-e', 'OPENCODE_API_KEY', '-e', 'BOT_TOKEN', '-e', 'DATABASE_URL', '-e', 'DATA_DIR',
                '-e', 'TELEGRAM_API_ROOT', '-e', 'WEB_HOST', '-e', 'WEB_PORT', '-e', 'SANDBOX_ENABLED', '-e', 'DEFAULT_MODEL',
                '-e', 'SLUSHA_SANDBOX_SOCKET', containerImage,
            ], { env: { ...env, DOCKER_HOST: dockerEnv.DOCKER_HOST, DOCKER_CONTEXT: '', DOCKER_DEFAULT_PLATFORM: '', SANDBOX_ENABLED: 'true' }, stdout: 'ignore', stderr: 'ignore' });
        } else {
            app = Bun.spawn(['bun', 'src/main.ts'], { env, stdout: 'ignore', stderr: 'ignore' });
        }
        await waitFor(async () => {
            try { return (await fetch(`http://127.0.0.1:${port}/healthz`)).ok; } catch { return false; }
        }, 'startup', 30_000);
    }
    async function stop() {
        if (stopping) return stopping;
        if (systemdService) {
            if (serviceStarted) await systemctl('stop', systemdService);
            serviceStarted = false;
            return;
        }
        if (!app) return;
        const child = app;
        stopping = (async () => {
            if (containerImage) {
                const docker = Bun.spawn(['docker', 'stop', '--time', '10', container], { env: dockerEnv, stdout: 'ignore', stderr: 'ignore' });
                const result = await docker.exited;
                if (result !== 0 && child.exitCode === null) throw new Error('Failed to stop app container');
            } else {
                child.kill('SIGTERM');
            }
            const stopped = await Promise.race([child.exited.then(() => true), Bun.sleep(15_000).then(() => false)]);
            if (!stopped) { child.kill('SIGKILL'); await child.exited; throw new Error('App did not shut down'); }
            app = undefined;
        })();
        try { await stopping; } finally { stopping = undefined; }
    }
    function enqueue(id: number, text: string) {
        updates.push({ update_id: id, message: { message_id: id, date: Math.floor(Date.now() / 1000), chat: { id: chatId, type: 'private', first_name: 'Synthetic' }, from: { id: chatId, is_bot: false, first_name: 'Synthetic' }, text } });
    }
    async function waitForReply(id: number) {
        await waitFor(async () => {
            const rows = await db!`select status from updates where id = ${id}`;
            return rows[0]?.status === 'done';
        }, `update ${id}`);
        const reply = sent.find((message) => message.reply_parameters?.message_id === id);
        expect(reply).toBeDefined();
        expect(reply!.chat_id).toBe(chatId);
        expect(reply!.text.trim().length).toBeGreaterThan(0);
        return reply!.text;
    }

    try {
        await admin.unsafe(`CREATE DATABASE ${database}`);
        created = true;
        db = postgres(url.toString(), { max: 1 });
        await start();
        if (systemdService) {
            const pid = await systemctl('show', systemdService, '--property=MainPID', '--value');
            expectNoNetAdmin(await readFile(`/proc/${pid}/status`, 'utf8'));
            const access = Bun.spawn(['runuser', '-u', 'slusha', '--', 'test', '!', '-w', '/var/run/docker.sock']);
            expect(await access.exited).toBe(0);
        }
        if (containerImage) {
            const process = Bun.spawn(['docker', 'exec', container, 'grep', 'CapEff', '/proc/1/status'], { env: dockerEnv, stdout: 'pipe', stderr: 'ignore' });
            const status = await new Response(process.stdout).text();
            expect(await process.exited).toBe(0);
            expectNoNetAdmin(status);
            const access = Bun.spawn(['docker', 'exec', container, 'test', '!', '-e', '/var/run/docker.sock'], { env: dockerEnv });
            expect(await access.exited).toBe(0);
        }
        enqueue(101, 'Remember this synthetic fact: my imaginary cat is named Zephyr. Please acknowledge in a reply.');
        await waitForReply(101);
        const persisted = await db`select kind, update_id, message_id from events order by id`;
        expect(persisted.some((row) => row.kind === 'message' && Number(row.update_id) === 101)).toBe(true);
        expect(persisted.some((row) => row.kind === 'bot_message')).toBe(true);

        const auth = await sign({ user: { id: chatId, first_name: 'Synthetic' } }, token, new Date());
        const config = await fetch(`http://127.0.0.1:${port}/api/config?scope=private`, { headers: { authorization: `tma ${auth}` } });
        expect(config.status).toBe(200);
        expect(configResponseSchema.parse(await config.json())).toMatchObject({ scope: 'private', chatId });
        expect((await fetch(`http://127.0.0.1:${port}/api/config`, { headers: { authorization: 'tma invalid' } })).status).toBe(401);

        let archiveInode: number | undefined;
        if (containerImage || systemdService) {
            enqueue(102, 'Run the shell command `printf sandbox-proof > proof.txt`, then read proof.txt using the shell and reply with its contents.');
            expect(await waitForReply(102)).toContain('sandbox-proof');
            const archive = join(dir, 'workspaces', `${chatId}_0.tar`);
            const archiveInfo = await stat(archive);
            expect(archiveInfo.isFile()).toBe(true);
            archiveInode = archiveInfo.ino;
            const tar = Bun.spawn(['tar', '-xOf', archive, './proof.txt'], { stdout: 'pipe', stderr: 'ignore' });
            const contents = await new Response(tar.stdout).text();
            expect(await tar.exited).toBe(0);
            expect(contents).toBe('sandbox-proof');
        }
        if (systemdService) {
            let backup = '';
            await waitFor(async () => {
                try {
                    const entries = await readdir(join(dir, 'backups'));
                    backup = entries.find((entry) => entry.startsWith('backup-')) ?? '';
                    return !!backup;
                } catch { return false; }
            }, 'scheduled backup', 90_000);
            expect((await stat(join(dir, 'backups', backup, 'postgres.dump'))).isFile()).toBe(true);
            await systemctl('restart', 'docker.service');
            await waitFor(async () => {
                try { return (await fetch(`http://127.0.0.1:${port}/healthz`)).ok; } catch { return false; }
            }, 'Docker restart', 30_000);
            expect(await systemctl('is-active', systemdService)).toBe('active');
        }
        await stop();
        await start();
        if (containerImage || systemdService) {
            enqueue(103, 'Use the shell to read proof.txt and reply with its contents. Also recall the name of my imaginary cat.');
            const reply = await waitForReply(103);
            expect(reply).toContain('sandbox-proof');
            expect(reply).toMatch(/zephyr|зефир/i);
            expect((await stat(join(dir, 'workspaces', `${chatId}_0.tar`))).ino).not.toBe(archiveInode);
        } else {
            enqueue(102, 'What was the name of my imaginary cat? Reply with its name.');
            expect(await waitForReply(102)).toMatch(/zephyr|зефир/i);
            expect((await db`select status from updates where id = 102`)[0]?.status).toBe('done');
            expect((await db`select count(*)::int as count from events where update_id = 102`)[0]?.count).toBe(1);
        }
    } finally {
        try { await stop(); } finally {
            if (containerImage || systemdService) process.removeListener('SIGTERM', onSigterm);
            fake.stop(true);
            if (db) await db.end();
            if (created) await admin.unsafe(`DROP DATABASE ${database} WITH (FORCE)`);
            await admin.end();
            await rm(dir, { recursive: true, force: true });
            if (systemdService && systemdEnvFile) await rm(systemdEnvFile, { force: true });
        }
    }
}, timeout);
