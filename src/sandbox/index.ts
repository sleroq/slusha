import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { Bash, InMemoryFs } from 'just-bash';
import { z } from 'zod';

export interface SandboxOptions {
    rootDir: string;
}

export interface SandboxScope {
    chatId: number;
}

export interface ExecuteOptions extends SandboxScope {
    command: string;
    javascriptEnabled?: boolean;
    timeoutMs?: number;
}

export interface ExecuteResult {
    stdout: string;
    stderr: string;
    exitCode: number;
}

export class SandboxUnavailableError extends Error {
    readonly code = 'SANDBOX_UNAVAILABLE';

    constructor(message = 'Sandbox is unavailable') {
        super(message);
        this.name = 'SandboxUnavailableError';
    }
}

const contentLimit = 25_000_000;
const entryLimit = 10_000;
const entrySchema = z.object({
    path: z.string().startsWith('/'),
    mode: z.number().int(),
    mtime: z.string(),
    type: z.enum(['directory', 'file', 'symlink', 'link']),
    content: z.string().optional(),
});
const snapshotSchema = z.array(entrySchema).max(entryLimit);
type Entry = z.infer<typeof entrySchema>;

// Instances in this process share a queue for each persisted workspace.
const queues = new Map<string, Promise<unknown>>();

async function serialized<T>(key: string, work: () => Promise<T>): Promise<T> {
    const previous = queues.get(key) ?? Promise.resolve();
    const current = previous.catch(() => {}).then(work);
    queues.set(key, current);
    try {
        return await current;
    } finally {
        if (queues.get(key) === current) queues.delete(key);
    }
}

async function snapshot(fs: InMemoryFs): Promise<Entry[]> {
    const paths = fs
        .getAllPaths()
        .filter((path) => path !== '/')
        .sort();
    if (paths.length > entryLimit) throw new Error('Sandbox file count limit exceeded');
    const entries: Entry[] = [];
    const identities = new Map<string, string>();
    for (const path of paths) {
        const stat = await fs.lstat(path);
        const common = { path, mode: stat.mode, mtime: stat.mtime.toISOString() };
        if (stat.isDirectory) entries.push({ ...common, type: 'directory' });
        else if (stat.isSymbolicLink)
            entries.push({ ...common, type: 'symlink', content: await fs.readlink(path) });
        else if (stat.isFile) {
            const existing = stat.identity && identities.get(stat.identity);
            if (existing) entries.push({ ...common, type: 'link', content: existing });
            else {
                if (stat.identity) identities.set(stat.identity, path);
                entries.push({
                    ...common,
                    type: 'file',
                    content: Buffer.from(await fs.readFileBuffer(path)).toString('base64'),
                });
            }
        }
    }
    return entries;
}

async function restore(fs: InMemoryFs, entries: Entry[]): Promise<void> {
    for (const name of await fs.readdir('/')) await fs.rm(`/${name}`, { recursive: true });
    for (const entry of entries) {
        if (entry.type === 'directory') await fs.mkdir(entry.path);
        else if (entry.type === 'symlink') await fs.symlink(entry.content!, entry.path);
        else if (entry.type === 'link') await fs.link(entry.content!, entry.path);
        else await fs.writeFile(entry.path, Buffer.from(entry.content!, 'base64'));
        if (entry.type !== 'symlink') {
            await fs.chmod(entry.path, entry.mode);
            const time = new Date(entry.mtime);
            await fs.utimes(entry.path, time, time);
        }
    }
}

function workspacePath(root: string, scope: SandboxScope): string {
    if (!Number.isSafeInteger(scope.chatId)) throw new Error('Invalid sandbox scope');
    return resolve(root, `${scope.chatId}.json`);
}

export function createSandbox(options: SandboxOptions) {
    const root = resolve(options.rootDir);
    let closed = false;
    const pending = new Set<Promise<unknown>>();

    function run<T>(path: string, work: () => Promise<T>): Promise<T> {
        if (closed) return Promise.reject(new SandboxUnavailableError('Sandbox is closed'));
        const operation = serialized(path, work);
        pending.add(operation);
        void operation.then(
            () => pending.delete(operation),
            () => pending.delete(operation),
        );
        return operation;
    }

    return {
        async recover(): Promise<void> {
            if (closed) throw new SandboxUnavailableError('Sandbox is closed');
            await mkdir(root, { recursive: true });
        },
        async execute(request: ExecuteOptions): Promise<ExecuteResult> {
            const path = workspacePath(root, request);

            return run(path, async () => {
                await mkdir(root, { recursive: true });
                const fs = new InMemoryFs({}, { maxTotalBytes: contentLimit });

                // Bootstrap both command sets before loading the workspace, so a full
                // workspace can still start a shell and delete files.
                if (!request.javascriptEnabled) new Bash({ fs, javascript: true });
                const bash = new Bash({
                    fs,
                    javascript: request.javascriptEnabled === true,
                    executionLimits: { maxExecutionTimeMs: request.timeoutMs ?? 30_000 },
                });

                let stored: string | undefined;
                try {
                    stored = await readFile(path, 'utf8');
                } catch (error) {
                    if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT'))
                        throw error;
                }
                if (stored !== undefined)
                    await restore(fs, snapshotSchema.parse(JSON.parse(stored)));
                // Materialize bootstrap files before execution so snapshotting cannot
                // allocate their contents after a command fills the filesystem.
                else await snapshot(fs);

                let result: ExecuteResult;
                try {
                    const { stdout, stderr, exitCode } = await bash.exec(request.command);
                    result = { stdout, stderr, exitCode };
                } catch (error) {
                    if (!(error instanceof Error) || !error.message.startsWith('ENOSPC:'))
                        throw error;
                    result = { stdout: '', stderr: `${error.message}\n`, exitCode: 1 };
                }

                const data = JSON.stringify(await snapshot(fs));
                const temporary = resolve(dirname(path), `.${randomUUID()}.tmp`);
                try {
                    await writeFile(temporary, data, { flag: 'wx', mode: 0o600 });
                    await rename(temporary, path);
                } finally {
                    await rm(temporary, { force: true });
                }

                return result;
            });
        },
        async resetFiles(scope: SandboxScope): Promise<void> {
            const path = workspacePath(root, scope);
            await run(path, () => rm(path, { force: true }));
        },
        async close(): Promise<void> {
            closed = true;
            await Promise.allSettled(pending);
        },
    };
}
