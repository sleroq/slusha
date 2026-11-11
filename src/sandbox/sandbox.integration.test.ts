import { expect, test } from 'bun:test';
import { execFileSync, spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { createServer, request } from 'node:http';
import * as net from 'node:net';
import { tmpdir } from 'node:os';
import { isAbsolute, join } from 'node:path';
import { createSandbox, SandboxUnavailableError } from './index';

const integration = process.env.RUN_SANDBOX_INTEGRATION === '1' ? test : test.skip;

integration(
    'real runsc sessions, limits, networking, and firewall preflight',
    async () => {
        const rootDir = await mkdtemp(join(tmpdir(), 'slusha-sandbox-'));
        const socketDir = await mkdtemp('/run/slusha-test-');
        const socketPath = join(socketDir, 'sandbox.sock');
        const previousSocket = process.env.SLUSHA_SANDBOX_SOCKET;
        process.env.SLUSHA_SANDBOX_SOCKET = socketPath;
        const binary = process.env.SANDBOXD_BINARY;
        if (!binary || !isAbsolute(binary))
            throw new Error('SANDBOXD_BINARY must be an absolute path');
        let broker: ReturnType<typeof spawn> | undefined;
        const image = process.env.SANDBOX_IMAGE ?? 'slusha-sandbox';
        const brokerEnv = { ...process.env, SANDBOX_IMAGE: image };
        const sandbox = createSandbox({ rootDir });
        const dockerBinary = execFileSync('which', ['docker'], { encoding: 'utf8' }).trim();
        const previousPath = process.env.PATH;
        const fakeBin = join(socketDir, 'bin');
        const dockerCalls = join(socketDir, 'docker-calls');
        const scope = { chatId: 123, topicId: 456 };
        function execute(command: string, timeoutMs = 30_000) {
            return sandbox.execute({ ...scope, command, timeoutMs });
        }
        function docker(...args: string[]) {
            return execFileSync(dockerBinary, args, {
                encoding: 'utf8',
                env: {
                    ...process.env,
                    DOCKER_HOST: 'unix:///var/run/docker.sock',
                    DOCKER_CONTEXT: '',
                    DOCKER_DEFAULT_PLATFORM: '',
                },
            });
        }

        async function waitForContainersToStop() {
            for (let i = 0; i < 150; i++) {
                if (!docker('ps', '-aq', '--filter', 'label=org.slusha.managed=1').trim()) return;
                await new Promise((done) => setTimeout(done, 100));
            }
            throw new Error('Managed containers were not removed');
        }
        async function startBroker() {
            broker = spawn(binary!, ['serve'], { env: brokerEnv, stdio: 'inherit' });
            for (let i = 0; i < 400; i++) {
                if (broker.exitCode !== null) throw new Error('Sandbox broker exited');
                try {
                    if ((await brokerRequest('GET', '/health')).status === 200) return;
                } catch {
                    // The broker has not started listening yet.
                }
                await new Promise((done) => setTimeout(done, 100));
            }
            throw new Error('Sandbox broker did not start');
        }
        async function stopBroker(signal: NodeJS.Signals = 'SIGTERM') {
            if (!broker) return;
            const child = broker;
            broker = undefined;
            if (child.exitCode === null && child.signalCode === null) {
                child.kill(signal);
                await new Promise<void>((done) => child.once('close', () => done()));
            }
        }
        async function brokerRequest(
            method: string,
            path: string,
            body?: string,
        ): Promise<{ status: number; body: string }> {
            return await new Promise((resolve, reject) => {
                const req = request(
                    { socketPath, method, path, headers: { 'content-type': 'application/json' } },
                    (response) => {
                        const chunks: Buffer[] = [];
                        response.on('data', (chunk: Buffer) => chunks.push(chunk));
                        response.on('end', () =>
                            resolve({
                                status: response.statusCode ?? 0,
                                body: Buffer.concat(chunks).toString(),
                            }),
                        );
                        response.on('error', reject);
                    },
                );
                req.on('error', reject);
                req.end(body);
            });
        }

        try {
            if (process.getuid?.() !== 0)
                throw new Error('Sandbox integration requires root in a disposable Linux VM');
            await mkdir(fakeBin);
            await writeFile(
                join(fakeBin, 'docker'),
                `#!/bin/sh\necho called >> '${dockerCalls}'\nexit 1\n`,
                { mode: 0o755 },
            );
            process.env.PATH = `${fakeBin}:${previousPath ?? ''}`;
            if (docker('ps', '-aq', '--filter', 'label=org.slusha.managed=1').trim())
                throw new Error(
                    'Remove existing managed containers before running this isolated test',
                );
            expect(sandbox.recover()).rejects.toBeInstanceOf(SandboxUnavailableError);
            execFileSync(binary, ['setup'], { env: brokerEnv });
            const orphan = docker(
                'create',
                '--runtime=runsc',
                '--label',
                'org.slusha.managed=1',
                '--entrypoint=sh',
                image,
                '-c',
                'sleep 60',
            ).trim();
            docker('start', orphan);
            const unrelated = docker('create', '--entrypoint=sh', image, '-c', 'sleep 60').trim();
            const orphanTemp = join(rootDir, '.00000000-0000-4000-8000-000000000000.tmp');
            await writeFile(orphanTemp, 'orphan');
            await writeFile(join(rootDir, '.keep.tmp'), 'keep');
            try {
                await startBroker();
                await sandbox.recover();
                expect(docker('ps', '-aq', '--filter', `id=${orphan}`).trim()).toBe('');
                expect(docker('ps', '-aq', '--filter', `id=${unrelated}`).trim()).toBe(
                    unrelated.slice(0, 12),
                );
                expect((await readdir(rootDir)).sort()).toEqual(['.keep.tmp', '.recovery.lock']);
            } finally {
                docker('rm', '-f', unrelated);
            }
            const first = await execute('printf out; printf err >&2; echo persisted > file');
            expect(first).toEqual({ stdout: 'out', stderr: 'err', exitCode: 0 });
            expect((await execute('cat file')).stdout.trim()).toBe('persisted');
            expect(await readdir(fakeBin)).toEqual(['docker']);
            expect(stat(dockerCalls)).rejects.toMatchObject({ code: 'ENOENT' });
            const executable = await execute(
                'printf "#!/bin/sh\\necho executable\\n" > script; chmod +x script; ./script',
            );
            if (executable.exitCode !== 0) throw new Error(executable.stderr);
            expect(executable.stdout.trim()).toBe('executable');
            expect((await execute('exit 23')).exitCode).toBe(23);
            expect(
                (await sandbox.execute({ chatId: 123, topicId: 457, command: 'test ! -e file' }))
                    .exitCode,
            ).toBe(0);
            expect((await readdir(rootDir)).filter((name) => name.endsWith('.tar')).sort()).toEqual(
                ['123_456.tar', '123_457.tar'],
            );
            expect((await stat(join(rootDir, '123_456.tar'))).isFile()).toBe(true);
            const restarted = createSandbox({ rootDir });
            expect((await restarted.execute({ ...scope, command: 'cat file' })).stdout.trim()).toBe(
                'persisted',
            );
            await restarted.close();
            const truncated = await execute(
                'head -c 100000 /dev/zero | tr "\\0" x; head -c 100000 /dev/zero | tr "\\0" y >&2',
            );
            expect(truncated.stdout.length).toBe(65536);
            expect(truncated.stderr.length).toBe(65536);
            const floodStart = Date.now();
            const flood = await execute('echo changed > file; yes', 30000);
            expect(flood.exitCode).toBe(125);
            expect(flood.stderr).toContain('output limit exceeded');
            expect(flood.stdout.length).toBe(65536);
            expect(Date.now() - floodStart).toBeLessThan(10000);
            expect((await execute('cat file')).stdout.trim()).toBe('persisted');
            expect((await execute('echo changed > file; sleep 60', 5000)).exitCode).toBe(124);
            await waitForContainersToStop();
            expect((await execute('cat file')).stdout.trim()).toBe('persisted');
            expect(docker('ps', '-aq', '--filter', 'label=org.slusha.managed=1').trim()).toBe('');
            const before = await readFile(join(rootDir, '123_456.tar'));
            expect(
                execute(
                    'dd if=/dev/zero of=large bs=100000 count=249 2>/dev/null; i=0; while [ "$i" -lt 400 ]; do touch "f$i"; i=$((i+1)); done',
                ),
            ).rejects.toThrow();
            expect(await readFile(join(rootDir, '123_456.tar'))).toEqual(before);
            expect((await stat(join(rootDir, '123_456.tar'))).size).toBeLessThanOrEqual(25_000_000);
            expect((await execute('cat file; test ! -e large')).stdout.trim()).toBe('persisted');
            const concurrent = execute('sleep 4');
            await new Promise((done) => setTimeout(done, 2000));
            const ids = docker('ps', '-q', '--filter', 'label=org.slusha.managed=1')
                .trim()
                .split('\n')
                .filter(Boolean);
            expect(ids.length).toBe(1);
            const container = JSON.parse(docker('inspect', ids[0]))[0];
            const config = container.HostConfig;
            expect(container.Config.Labels['org.slusha.managed']).toBe('1');
            const resolverMount = container.Mounts.find(
                (mount: { Destination: string }) => mount.Destination === '/etc/resolv.conf',
            );
            expect(resolverMount.Source.startsWith('/tmp/slusha-')).toBe(true);
            expect(await readFile(resolverMount.Source, 'utf8')).toBe('nameserver 1.1.1.1\n');
            expect(container.Config.User).toBe('1000:1000');
            expect(config.ReadonlyRootfs).toBe(true);
            expect(config.CapDrop).toContain('ALL');
            expect(config.LogConfig.Type).toBe('none');
            expect(config.NetworkMode).toBe('slusha-gvisor');
            expect(config.Memory).toBe(128 * 1024 * 1024);
            expect(config.MemorySwap).toBe(config.Memory);
            expect(config.PidsLimit).toBe(64);
            expect(config.NanoCpus).toBe(500_000_000);
            await concurrent;
            expect(config.Runtime).toBe('runsc');
            expect(config.Privileged).toBe(false);
            // Process creation under this runsc can kill the container instead of returning EAGAIN.
            // Either outcome must leave the prior snapshot intact and the container gone.
            let pressureFailed = false;
            try {
                const pressure = await execute('while :; do sleep 30 & done', 10000);
                pressureFailed = pressure.exitCode !== 0;
            } catch {
                pressureFailed = true;
            }
            expect(pressureFailed).toBe(true);
            expect((await execute('cat file')).stdout.trim()).toBe('persisted');
            expect(docker('ps', '-aq', '--filter', 'label=org.slusha.managed=1').trim()).toBe('');
            const firstWrite = execute('sleep 2; echo first >> order');
            await new Promise((done) => setTimeout(done, 500));
            const secondWrite = execute('echo second >> order');
            await Promise.all([firstWrite, secondWrite]);
            expect((await execute('cat order')).stdout).toBe('first\nsecond\n');
            const runs = Array.from({ length: 5 }, (_, topicId) =>
                sandbox.execute({ chatId: 900, topicId, command: 'sleep 6', timeoutMs: 30000 }),
            );
            await new Promise((done) => setTimeout(done, 3000));
            const active = docker('ps', '-q', '--filter', 'label=org.slusha.managed=1')
                .trim()
                .split('\n')
                .filter(Boolean);
            expect(active.length).toBeGreaterThan(0);
            expect(active.length).toBeLessThanOrEqual(4);
            expect((await Promise.all(runs)).every((result) => result.exitCode === 0)).toBe(true);

            const activeWrite = execute('sleep 3; echo recovery > recovered');
            await new Promise((done) => setTimeout(done, 1000));
            const recovering = createSandbox({ rootDir });
            let recovered = false;
            const recovery = recovering.recover().then(() => {
                recovered = true;
            });
            await new Promise((done) => setTimeout(done, 500));
            expect(recovered).toBe(false);
            await activeWrite;
            await recovery;
            expect((await execute('cat recovered')).stdout.trim()).toBe('recovery');
            await recovering.close();

            const slowClients: net.Socket[] = [];
            try {
                for (let i = 0; i < 4; i++) {
                    const connection = net.createConnection(socketPath);
                    await new Promise<void>((done, reject) => {
                        connection.once('error', reject);
                        connection.once('connect', done);
                    });
                    connection.write(
                        'POST /execute HTTP/1.1\r\nHost: localhost\r\nContent-Length: 100\r\n\r\n{',
                    );
                    connection.resume();
                    slowClients.push(connection);
                }
                await new Promise((done) => setTimeout(done, 500));
                expect((await brokerRequest('GET', '/health')).status).toBe(503);
                await new Promise((done) => setTimeout(done, 11_000));
                expect((await brokerRequest('GET', '/health')).status).toBe(200);
            } finally {
                for (const connection of slowClients) connection.destroy();
            }

            // The broker accepts only the execution protocol, not container configuration.
            for (const extra of [
                { image: 'alpine' },
                { privileged: true },
                { hostPath: '/etc/shadow' },
                { mounts: ['/etc:/host'] },
                { dockerArgs: ['--privileged'] },
            ]) {
                const response = await brokerRequest(
                    'POST',
                    '/execute',
                    JSON.stringify({ command: 'echo should-not-run', timeoutMs: 30000, ...extra }),
                );
                expect(response.status).toBe(400);
            }
            for (const body of [
                'null',
                '{"command":"true","timeoutMs":0}',
                '{"command":"true","timeoutMs":120001}',
                '{"command":"true\\u0000","timeoutMs":1000}',
            ]) {
                expect((await brokerRequest('POST', '/execute', body)).status).toBe(400);
            }
            const oversized = Buffer.alloc(25_000_001).toString('base64');
            expect(
                (
                    await brokerRequest(
                        'POST',
                        '/execute',
                        JSON.stringify({ command: 'true', timeoutMs: 1000, archive: oversized }),
                    )
                ).status,
            ).toBe(400);
            expect(docker('ps', '-aq', '--filter', 'label=org.slusha.managed=1').trim()).toBe('');

            // A disconnected client must cancel its running container.
            const modulePath = join(import.meta.dir, 'index.ts');
            const crashScript = `import {createSandbox} from ${JSON.stringify(modulePath)}; await createSandbox({rootDir:${JSON.stringify(rootDir)}}).execute({chatId:9999,topicId:1,command:'sleep 60',timeoutMs:30000});`;
            const disconnected = spawn(process.execPath, ['-e', crashScript], { stdio: 'ignore' });
            try {
                let running = '';
                for (let i = 0; i < 100 && !running; i++) {
                    await new Promise((done) => setTimeout(done, 100));
                    running = docker('ps', '-q', '--filter', 'label=org.slusha.managed=1').trim();
                }
                expect(running).not.toBe('');
                disconnected.kill('SIGKILL');
                for (let i = 0; i < 150 && running; i++) {
                    await new Promise((done) => setTimeout(done, 100));
                    running = docker('ps', '-aq', '--filter', 'label=org.slusha.managed=1').trim();
                }
                expect(running).toBe('');
                expect(
                    (
                        await sandbox.execute({ chatId: 9999, topicId: 1, command: 'echo resumed' })
                    ).stdout.trim(),
                ).toBe('resumed');
            } finally {
                disconnected.kill('SIGKILL');
            }
            await stopBroker('SIGKILL');
            expect(execute('echo should-not-run')).rejects.toBeInstanceOf(SandboxUnavailableError);
            const crashOrphan = docker(
                'create',
                '--label',
                'org.slusha.managed=1',
                '--entrypoint=sh',
                image,
                '-c',
                'sleep 60',
            ).trim();
            await startBroker();
            expect(docker('ps', '-aq', '--filter', `id=${crashOrphan}`).trim()).toBe('');
            expect((await execute('cat file')).stdout.trim()).toBe('persisted');
            const publicNetwork = await execute(
                'nslookup example.com && curl -4 -fsS -m 10 https://example.com >/dev/null',
                30000,
            );
            expect(publicNetwork.exitCode).toBe(0);
            const host = createServer((_request, response) => response.end('host reachable'));
            await new Promise<void>((resolveListen) =>
                host.listen(0, '172.30.250.1', resolveListen),
            );
            const address = host.address();
            if (!address || typeof address === 'string')
                throw new Error('Host listener has no port');
            expect(await (await fetch(`http://172.30.250.1:${address.port}`)).text()).toBe(
                'host reachable',
            );
            const peer = docker(
                'run',
                '-d',
                '--runtime=runc',
                '--network=slusha-gvisor',
                '--entrypoint=sh',
                image,
                '-c',
                'while :; do printf "HTTP/1.0 200 OK\\r\\n\\r\\npeer" | nc -l -p 18081; done',
            ).trim();
            try {
                const peerIp = docker(
                    'inspect',
                    '--format',
                    '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}',
                    peer,
                ).trim();
                docker('exec', peer, 'nc', '-z', '-w', '2', '127.0.0.1', '18081');
                execFileSync('iptables', ['-w', '-Z', 'SLUSHA-GVISOR']);
                const denied = await execute(
                    `for target in 172.30.250.1:${address.port} ${peerIp}:18081 10.0.0.1:80 169.254.169.254:80; do if curl --noproxy '*' -fsS -m 2 http://$target >/dev/null; then exit 1; fi; done; if wget -q -T 2 -O /dev/null http://[2606:4700:4700::1111]; then exit 1; fi`,
                );
                expect(denied.exitCode).toBe(0);
                const counters = execFileSync(
                    'iptables',
                    ['-w', '-n', '-v', '-x', '-L', 'SLUSHA-GVISOR'],
                    { encoding: 'utf8' },
                );
                for (const destination of ['10.0.0.0/8', '169.254.0.0/16']) {
                    const line = counters.split('\n').find((entry) => entry.includes(destination));
                    expect(Number(line?.trim().split(/\s+/)[0])).toBeGreaterThan(0);
                }
                const bridgeLine = counters
                    .split('\n')
                    .find((entry) => entry.includes('br-slusha-gv'));
                expect(Number(bridgeLine?.trim().split(/\s+/)[0])).toBeGreaterThan(0);
            } finally {
                docker('rm', '-f', peer);
                await new Promise<void>((resolveClose) => host.close(() => resolveClose()));
            }
            await stopBroker();
            expect(execute('echo should-not-run')).rejects.toBeInstanceOf(SandboxUnavailableError);
            await rm(socketPath, { force: true });
            const connections = new Set<net.Socket>();
            const invalidVerifier = net.createServer((connection) => {
                connections.add(connection);
                connection.once('close', () => connections.delete(connection));
                connection.end('OK\nextra');
            });
            await new Promise<void>((done) => invalidVerifier.listen(socketPath, done));
            expect(execute('echo should-not-run')).rejects.toBeInstanceOf(SandboxUnavailableError);
            for (const connection of connections) connection.destroy();
            await new Promise<void>((done) => invalidVerifier.close(() => done()));
            await rm(socketPath, { force: true });
            const stalledVerifier = net.createServer((connection) => {
                connections.add(connection);
                connection.once('close', () => connections.delete(connection));
                connection.resume();
            });
            await new Promise<void>((done) => stalledVerifier.listen(socketPath, done));
            expect(execute('echo should-not-run', 500)).rejects.toBeInstanceOf(
                SandboxUnavailableError,
            );
            for (const connection of connections) connection.destroy();
            await new Promise<void>((done) => stalledVerifier.close(() => done()));
            await rm(socketPath, { force: true });
            await startBroker();
            expect((await execute('echo verifier-restarted')).stdout.trim()).toBe(
                'verifier-restarted',
            );
            execFileSync('iptables', ['-w', '-I', 'INPUT', '1', '-i', 'lo', '-j', 'ACCEPT']);
            try {
                expect(execute('echo should-not-run')).rejects.toBeInstanceOf(
                    SandboxUnavailableError,
                );
            } finally {
                execFileSync('iptables', ['-w', '-D', 'INPUT', '-i', 'lo', '-j', 'ACCEPT']);
            }
            execFileSync('iptables', ['-w', '-D', 'INPUT', '-i', 'br-slusha-gv', '-j', 'DROP']);
            try {
                expect(execute('echo should-not-run')).rejects.toBeInstanceOf(
                    SandboxUnavailableError,
                );
            } finally {
                execFileSync('iptables', [
                    '-w',
                    '-I',
                    'INPUT',
                    '1',
                    '-i',
                    'br-slusha-gv',
                    '-j',
                    'DROP',
                ]);
            }
            execFileSync('ip', ['route', 'add', '11.99.0.0/24', 'dev', 'lo']);
            try {
                const orphanWithStaleFirewall = docker(
                    'create',
                    '--label',
                    'org.slusha.managed=1',
                    '--entrypoint=sh',
                    image,
                    '-c',
                    'sleep 60',
                ).trim();
                expect(sandbox.recover()).rejects.toBeInstanceOf(SandboxUnavailableError);
                expect(
                    docker('ps', '-aq', '--filter', `id=${orphanWithStaleFirewall}`).trim(),
                ).not.toBe('');
                docker('rm', '-f', orphanWithStaleFirewall);
                expect(execute('echo should-not-run')).rejects.toBeInstanceOf(
                    SandboxUnavailableError,
                );
                execFileSync(binary, ['setup'], { env: brokerEnv });
                expect(
                    execFileSync('iptables', ['-w', '-S', 'SLUSHA-GVISOR'], { encoding: 'utf8' }),
                ).toContain('-d 11.99.0.0/24 -j DROP');
            } finally {
                execFileSync('ip', ['route', 'del', '11.99.0.0/24', 'dev', 'lo']);
                execFileSync(binary, ['setup'], { env: brokerEnv });
            }
            const blockedFile = '/etc/slusha-gvisor/blocked-cidrs';
            const blockedBackup = `${blockedFile}.integration-${crypto.randomUUID()}`;
            await rename(blockedFile, blockedBackup);
            try {
                expect(() =>
                    execFileSync(binary, ['setup'], { env: brokerEnv, stdio: 'pipe' }),
                ).toThrow();
                for (const chain of ['INPUT', 'FORWARD']) {
                    const rules = execFileSync('iptables', ['-w', '-S', chain], {
                        encoding: 'utf8',
                    })
                        .split('\n')
                        .filter((line) => line.startsWith('-A '));
                    expect(rules[0]).toBe(`-A ${chain} -i br-slusha-gv -j DROP`);
                }
            } finally {
                await rename(blockedBackup, blockedFile);
                execFileSync(binary, ['setup'], { env: brokerEnv });
            }
            await sandbox.resetFiles(scope);
            expect((await execute('test ! -e file')).exitCode).toBe(0);
            await execute('echo original > file');
            const saved = await readFile(join(rootDir, '123_456.tar'));
            const running = execute('echo changed > file; sleep 60');
            const runningResult = running.catch((error) => error);
            for (
                let i = 0;
                i < 100 && !docker('ps', '-q', '--filter', 'label=org.slusha.managed=1').trim();
                i++
            ) {
                await new Promise((done) => setTimeout(done, 100));
            }
            expect(docker('ps', '-q', '--filter', 'label=org.slusha.managed=1').trim()).not.toBe(
                '',
            );
            const waiting = execute('echo waiting > file').catch((error) => error);
            const started = Date.now();
            await sandbox.close();
            expect(Date.now() - started).toBeLessThan(10000);
            expect(await runningResult).toBeInstanceOf(Error);
            expect(await waiting).toBeInstanceOf(Error);
            expect(await readFile(join(rootDir, '123_456.tar'))).toEqual(saved);
            await waitForContainersToStop();
            expect(docker('ps', '-aq', '--filter', 'label=org.slusha.managed=1').trim()).toBe('');
            expect(
                (await readdir(rootDir)).filter(
                    (name) =>
                        (name.endsWith('.tmp') && name !== '.keep.tmp') ||
                        name.startsWith('.resolver-'),
                ),
            ).toEqual([]);
            const afterClose = createSandbox({ rootDir });
            try {
                expect(
                    (await afterClose.execute({ ...scope, command: 'cat file' })).stdout.trim(),
                ).toBe('original');
            } finally {
                await afterClose.close();
            }
            expect(stat(dockerCalls)).rejects.toMatchObject({ code: 'ENOENT' });
        } finally {
            await sandbox.close();
            await stopBroker();
            if (previousSocket === undefined) delete process.env.SLUSHA_SANDBOX_SOCKET;
            else process.env.SLUSHA_SANDBOX_SOCKET = previousSocket;
            if (previousPath === undefined) delete process.env.PATH;
            else process.env.PATH = previousPath;
            await rm(socketDir, { recursive: true, force: true });
            await rm(rootDir, { recursive: true, force: true });
        }
    },
    240_000,
);
