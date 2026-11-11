import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import * as http from 'node:http';
import { resolve } from 'node:path';
import { z } from 'zod';

export interface SandboxOptions {
    rootDir: string;
}

export interface SandboxScope {
    chatId: number;
    topicId: number;
}

export interface ExecuteOptions extends SandboxScope {
    command: string;
    timeoutMs?: number;
}

export interface ExecuteResult {
    stdout: string;
    stderr: string;
    exitCode: number;
}

export class SandboxUnavailableError extends Error {
    readonly code = 'SANDBOX_UNAVAILABLE';

    constructor(message = 'Required gVisor sandbox protections are unavailable.') {
        super(message);
        this.name = 'SandboxUnavailableError';
    }
}

const archiveLimit = 25_000_000;
const responseLimit = Math.ceil(archiveLimit / 3) * 4 + 2 * 1024 * 1024;
const maxTimeout = 120_000;
const brokerResult = z.object({
    stdout: z.string(), stderr: z.string(), exitCode: z.number().int(), archive: z.string().optional(),
});

function scopeName(scope: SandboxScope) {
    if (!Number.isSafeInteger(scope.chatId) || !Number.isSafeInteger(scope.topicId)) {
        throw new Error('Invalid sandbox scope');
    }
    return `${scope.chatId}_${scope.topicId}`;
}

function checkDeadline(deadline: number, signal: AbortSignal) {
    signal.throwIfAborted();
    if (Date.now() >= deadline) throw new Error('Sandbox operation timed out');
}

async function acquire(path: string, deadline: number, wait: boolean, signal: AbortSignal, shared = false): Promise<ChildProcessWithoutNullStreams | undefined> {
    checkDeadline(deadline, signal);
    const seconds = Math.max(1, Math.ceil((deadline - Date.now()) / 1000));
    let args = ['-F', '-n'];
    if (wait) args = ['-F', '-w', String(seconds)];
    if (shared) args.push('-s');
    const child = spawn('flock', [...args, path, 'sh', '-c', 'printf x; cat >/dev/null'], { stdio: ['pipe', 'pipe', 'pipe'] });
    child.stdin.on('error', () => {});
    return await new Promise((resolveLock, reject) => {
        function abort() { child.stdin.end(); child.kill('SIGKILL'); finish(); reject(signal.reason); }
        const timer = setTimeout(() => { child.stdin.end(); child.kill('SIGKILL'); finish(); reject(new Error('Sandbox lock timed out')); }, Math.max(1, deadline - Date.now()));
        function finish() { clearTimeout(timer); signal.removeEventListener('abort', abort); }
        signal.addEventListener('abort', abort, { once: true });
        child.once('error', (error) => { finish(); reject(error); });
        child.stdout.once('data', () => { finish(); resolveLock(child); });
        child.once('close', () => { finish(); resolveLock(undefined); });
    });
}

async function privateDirectory(path: string) {
    await mkdir(path, { recursive: true, mode: 0o700 });
    const info = await stat(path);
    if (!info.isDirectory() || (info.mode & 0o077) !== 0 || info.uid !== process.getuid?.()) {
        throw new SandboxUnavailableError('Sandbox directories must be owned by the application user and inaccessible to other users');
    }
}

async function locked<T>(root: string, scope: SandboxScope, deadline: number, signal: AbortSignal, work: () => Promise<T>): Promise<T> {
    const slots = process.env.SANDBOX_LOCK_DIR ?? '/run/lock/slusha-gvisor';
    await privateDirectory(root);
    await privateDirectory(slots);
    const recovery = await acquire(resolve(root, '.recovery.lock'), deadline, true, signal, true);
    if (!recovery) throw new Error('Sandbox recovery lock unavailable');
    try {
        const session = await acquire(resolve(root, `${scopeName(scope)}.lock`), deadline, true, signal);
        if (!session) throw new Error('Sandbox session lock unavailable');
        let slot: ChildProcessWithoutNullStreams | undefined;
        try {
            while (!slot && Date.now() < deadline) {
                for (let i = 0; i < 4 && !slot; i++) slot = await acquire(resolve(slots, `slot-${i}.lock`), deadline, false, signal);
                if (!slot) await new Promise((done) => setTimeout(done, 50));
            }
            if (!slot) throw new Error('Sandbox concurrency limit timed out');
            checkDeadline(deadline, signal);
            return await work();
        } finally {
            slot?.stdin.end();
            session.stdin.end();
        }
    } finally {
        recovery.stdin.end();
    }
}

async function broker(method: string, path: string, body: string | undefined, deadline: number, signal: AbortSignal): Promise<string> {
    checkDeadline(deadline, signal);
    const headers: Record<string, string | number> = {};
    if (body !== undefined) {
        headers['content-type'] = 'application/json';
        headers['content-length'] = Buffer.byteLength(body);
    }

    return await new Promise((resolveResponse, reject) => {
        let completed = false;
        const request = http.request({
            socketPath: process.env.SLUSHA_SANDBOX_SOCKET ?? '/run/slusha-gvisor/sandbox.sock',
            method, path, signal, headers,
        }, (response) => {
            const chunks: Buffer[] = [];
            let size = 0;
            response.on('data', (chunk: Buffer) => {
                size += chunk.length;
                if (size > responseLimit) {
                    response.destroy(new SandboxUnavailableError('Sandbox broker response too large'));
                    return;
                }
                chunks.push(chunk);
            });
            response.once('error', (error) => {
                if (signal.aborted) reject(signal.reason);
                else if (error instanceof SandboxUnavailableError) reject(error);
                else reject(new SandboxUnavailableError(`Sandbox broker unavailable: ${String(error)}`));
            });
            response.once('end', () => {
                completed = true;
                const text = Buffer.concat(chunks).toString();
                if (!response.statusCode || response.statusCode < 200 || response.statusCode >= 300) {
                    reject(new SandboxUnavailableError(`Sandbox broker failed: ${text}`));
                } else {
                    resolveResponse(text);
                }
            });
        });

        const timer = setTimeout(() => request.destroy(new SandboxUnavailableError('Sandbox broker timed out')), Math.max(1, deadline - Date.now()));
        request.once('close', () => {
            clearTimeout(timer);
            if (!completed) reject(new SandboxUnavailableError('Sandbox broker closed without a complete response'));
        });
        request.once('error', (error) => {
            if (signal.aborted) reject(signal.reason);
            else if (error instanceof SandboxUnavailableError) reject(error);
            else reject(new SandboxUnavailableError(`Sandbox broker unavailable: ${String(error)}`));
        });
        request.end(body);
    });
}

export function createSandbox(options: SandboxOptions) {
    const root = resolve(options.rootDir);
    let closed = false;
    const pending = new Set<Promise<unknown>>();
    const shutdown = new AbortController();
    const signal = shutdown.signal;

    async function track<T>(operation: Promise<T>): Promise<T> {
        pending.add(operation);
        try {
            return await operation;
        } finally {
            pending.delete(operation);
        }
    }

    return {
        async recover(): Promise<void> {
            if (closed) throw new SandboxUnavailableError('Sandbox is closed');
            await track((async () => {
                await privateDirectory(root);
                const deadline = Date.now() + maxTimeout;
                const recovery = await acquire(resolve(root, '.recovery.lock'), deadline, true, signal);
                if (!recovery) throw new SandboxUnavailableError('Sandbox recovery lock unavailable');
                try {
                    for (const entry of await readdir(root, { withFileTypes: true })) {
                        if (entry.isFile() && /^\.[0-9a-f-]{36}\.tmp$/.test(entry.name)) {
                            await rm(resolve(root, entry.name));
                        } else if (entry.isDirectory() && entry.name.startsWith('.resolver-')) {
                            await rm(resolve(root, entry.name), { recursive: true });
                        }
                    }
                    await broker('GET', '/health', undefined, deadline, signal);
                } finally {
                    recovery.stdin.end();
                }
            })());
        },
        async execute(request: ExecuteOptions): Promise<ExecuteResult> {
            if (closed) throw new SandboxUnavailableError('Sandbox is closed');
            const timeout = request.timeoutMs ?? 30_000;
            if (!Number.isInteger(timeout) || timeout < 1 || timeout > maxTimeout) throw new Error('Invalid sandbox timeout');
            const deadline = Date.now() + timeout;

            return track(locked(root, request, deadline, signal, async () => {
                const archive = resolve(root, `${scopeName(request)}.tar`);
                let input: Buffer | undefined;
                try {
                    const info = await stat(archive);
                    if (info.size > archiveLimit) throw new Error('Stored sandbox archive exceeds 25,000,000 bytes');
                    input = await readFile(archive);
                    if (input.length > archiveLimit) throw new Error('Stored sandbox archive exceeds 25,000,000 bytes');
                } catch (error) {
                    if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT') throw error;
                }

                checkDeadline(deadline, signal);
                const payload = {
                    command: request.command, timeoutMs: Math.max(1, deadline - Date.now()), archive: input?.toString('base64'),
                };
                const text = await broker('POST', '/execute', JSON.stringify(payload), deadline + 10_000, signal);
                let result: z.infer<typeof brokerResult>;
                try {
                    result = brokerResult.parse(JSON.parse(text));
                } catch (error) {
                    throw new SandboxUnavailableError(`Invalid sandbox broker response: ${String(error)}`);
                }

                if (result.archive !== undefined) {
                    const data = Buffer.from(result.archive, 'base64');
                    if (data.length > archiveLimit || data.toString('base64') !== result.archive) {
                        throw new SandboxUnavailableError('Invalid sandbox broker archive');
                    }
                    const temporary = resolve(root, `.${randomUUID()}.tmp`);
                    try {
                        checkDeadline(deadline, signal);
                        await writeFile(temporary, data, { flag: 'wx', mode: 0o600 });
                        checkDeadline(deadline, signal);
                        await rename(temporary, archive);
                    } finally {
                        await rm(temporary, { force: true });
                    }
                }

                return { stdout: result.stdout, stderr: result.stderr, exitCode: result.exitCode };
            }));
        },
        async resetFiles(scope: SandboxScope): Promise<void> {
            if (closed) throw new SandboxUnavailableError('Sandbox is closed');
            await track(locked(root, scope, Date.now() + maxTimeout, signal, async () => {
                signal.throwIfAborted();
                await rm(resolve(root, `${scopeName(scope)}.tar`), { force: true });
            }));
        },
        async close(): Promise<void> {
            closed = true;
            shutdown.abort(new SandboxUnavailableError('Sandbox is closed'));
            await Promise.allSettled(pending);
        },
    };
}
