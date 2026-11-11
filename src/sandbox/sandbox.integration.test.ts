import { expect, test } from 'bun:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createSandbox } from './index';

test('execution, persistence, isolation, JavaScript and network policy', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'slusha-sandbox-'));
    const sandbox = createSandbox({ rootDir });

    let requests = 0;
    const server = Bun.serve({
        hostname: '127.0.0.1',
        port: 0,
        fetch() {
            requests++;
            return new Response('reachable');
        },
    });
    function execute(command: string, javascriptEnabled = false) {
        return sandbox.execute({ chatId: 1, command, javascriptEnabled });
    }

    try {
        await sandbox.recover();
        expect(
            await execute(
                "printf 'one\\ntwo\\n' > file; cat file | grep two; echo error >&2; exit 7",
            ),
        ).toEqual({ stdout: 'two\n', stderr: 'error\n', exitCode: 7 });
        expect((await execute('cat file')).stdout).toBe('one\ntwo\n');
        expect((await sandbox.execute({ chatId: 2, command: 'cat file' })).exitCode).not.toBe(0);
        expect((await execute('js-exec -c "console.log(1)"')).exitCode).not.toBe(0);
        expect((await execute('js-exec -c "console.log(1 + 2)"', true)).stdout).toBe('3\n');

        const url = `http://127.0.0.1:${server.port}/`;
        expect((await execute(`curl ${url}`)).exitCode).not.toBe(0);
        const network = await execute(`js-exec -c 'await fetch("${url}")'`, true);
        expect(network.exitCode).not.toBe(0);
        expect(network.stderr).toContain('Network access not configured');
        expect(requests).toBe(0);

        expect(
            (
                await execute(
                    `js-exec -c 'require("fs").writeFileSync("binary", Buffer.from([0, 255, 65]))'; mkdir dir; ln binary hard; ln -s ../binary dir/link`,
                    true,
                )
            ).exitCode,
        ).toBe(0);
        await sandbox.close();
        const restarted = createSandbox({ rootDir });
        try {
            expect(
                (
                    await restarted.execute({ chatId: 1, command: 'cat dir/link | base64' })
                ).stdout.trim(),
            ).toBe('AP9B');
            expect(
                (
                    await restarted.execute({ chatId: 1, command: 'cat hard | base64' })
                ).stdout.trim(),
            ).toBe('AP9B');
            await restarted.resetFiles({ chatId: 1 });
            expect((await restarted.execute({ chatId: 1, command: 'cat file' })).exitCode).not.toBe(
                0,
            );
        } finally {
            await restarted.close();
        }
    } finally {
        await server.stop();
        await sandbox.close();
        await rm(rootDir, { recursive: true, force: true });
    }
});

test('quota covers JavaScript and append, and deletion frees space', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'slusha-quota-'));
    const sandbox = createSandbox({ rootDir });
    function execute(command: string) {
        return sandbox.execute({ chatId: 1, command, javascriptEnabled: true });
    }

    try {
        const append = `js-exec -c 'require("fs").appendFileSync("big", "x".repeat(4000000))'`;
        for (let i = 0; i < 6; i++) expect((await execute(append)).exitCode).toBe(0);
        expect((await execute('stat -c %s big')).stdout.trim()).toBe('24000000');
        const overflow = await execute(append);
        expect(overflow.exitCode).not.toBe(0);
        expect(overflow.stderr).toContain('ENOSPC');
        expect((await execute('ln -s big alias')).exitCode).toBe(0);
        const symlinkOverflow = await execute(
            `js-exec -c 'require("fs").appendFileSync("alias", "x".repeat(4000000))'`,
        );
        expect(symlinkOverflow.exitCode).not.toBe(0);
        expect(symlinkOverflow.stderr).toContain('ENOSPC');

        const entries: { type: string; content?: string }[] = JSON.parse(
            await readFile(join(rootDir, '1.json'), 'utf8'),
        );
        const used = entries.reduce(
            (size, entry) =>
                size + (entry.type === 'file' ? Buffer.from(entry.content!, 'base64').length : 0),
            0,
        );
        const remaining = 25_000_000 - used;
        expect(remaining).toBeGreaterThan(0);
        const fill = await execute(
            `js-exec -c 'require("fs").appendFileSync("big", "x".repeat(${remaining}))'`,
        );
        expect(fill.exitCode).toBe(0);
        expect((await execute('echo x >> alias')).exitCode).not.toBe(0);
        const full: { type: string; content?: string }[] = JSON.parse(
            await readFile(join(rootDir, '1.json'), 'utf8'),
        );
        expect(
            full.reduce(
                (size, entry) =>
                    size +
                    (entry.type === 'file' ? Buffer.from(entry.content!, 'base64').length : 0),
                0,
            ),
        ).toBe(25_000_000);
        expect((await sandbox.execute({ chatId: 1, command: 'test -e big' })).exitCode).toBe(0);
        await sandbox.close();
        const restarted = createSandbox({ rootDir });
        try {
            expect(
                (
                    await restarted.execute({
                        chatId: 1,
                        command: 'rm big; echo recovered > ok; cat ok',
                    })
                ).stdout,
            ).toBe('recovered\n');
        } finally {
            await restarted.close();
        }
    } finally {
        await sandbox.close();
        await rm(rootDir, { recursive: true, force: true });
    }
}, 120_000);

test('concurrent operations on the same workspace are serialized', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'slusha-concurrent-'));
    const first = createSandbox({ rootDir });
    const second = createSandbox({ rootDir });
    try {
        await Promise.all([
            first.execute({ chatId: 1, command: 'sleep 0.1; echo first >> order' }),
            second.execute({ chatId: 1, command: 'echo second >> order' }),
        ]);
        expect((await first.execute({ chatId: 1, command: 'cat order' })).stdout).toBe(
            'first\nsecond\n',
        );
    } finally {
        await first.close();
        await second.close();
        await rm(rootDir, { recursive: true, force: true });
    }
});
