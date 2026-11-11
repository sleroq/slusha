import { mkdir } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { Api } from 'grammy';
import { createModels } from '@earendil-works/pi-ai/models';
import { opencodeGoProvider } from '@earendil-works/pi-ai/providers/opencode-go';
import { createAgentSessions } from './agent';
import { scheduleBackups } from './backup';
import { createBudgets } from './bot/budget';
import { createAgentActions, createConversationHandler } from './bot/conversation';
import { pendingRuns, recoverRuns, resumeRequest } from './bot/recovery';
import { createCharacters } from './characters';
import { createNameGenerator } from './characters/generation';
import { createDb } from './db/client';
import { migrateDb } from './db/migrate';
import { createSandbox } from './sandbox';
import { createSearch } from './search';
import { createConfigHandler, createSettings } from './settings';
import { createIngestion } from './telegram/ingestion';
import { pollingApi } from './telegram/api';
import { startTelemetry } from './telemetry';

function required(name: string) {
    const value = process.env[name];
    if (!value) throw new Error(`Missing ${name}`);
    return value;
}

function limit(name: string) {
    const value = process.env[name];
    if (!value) return undefined;
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed) || parsed < 1)
        throw new Error(`${name} must be a positive integer`);
    return parsed;
}

const botToken = required('BOT_TOKEN');
if (!process.env.OPENCODE_API_KEY && process.env.OPENCODE_TOKEN)
    process.env.OPENCODE_API_KEY = process.env.OPENCODE_TOKEN;
required('OPENCODE_API_KEY');
const dataDir = resolve(process.env.DATA_DIR ?? './data');
await mkdir(dataDir, { recursive: true });
const sandboxEnabled = process.env.SANDBOX_ENABLED !== 'false';
const sandbox = createSandbox({ rootDir: resolve(dataDir, 'workspaces') });
if (sandboxEnabled) await sandbox.recover();
const databaseUrl = required('DATABASE_URL');
const { db, close: closeDb } = createDb(databaseUrl);
await migrateDb(db);

const telegramApiRoot = process.env.TELEGRAM_API_ROOT ?? 'https://api.telegram.org';
const api = new Api(botToken, { apiRoot: telegramApiRoot });
const me = await api.getMe();
const adminIds = (process.env.BOT_ADMIN_IDS ?? '').split(',').filter(Boolean).map(Number);
if (adminIds.some((id) => !Number.isSafeInteger(id) || id <= 0))
    throw new Error('BOT_ADMIN_IDS must be comma-separated Telegram user IDs');

const tracing = startTelemetry({
    LANGFUSE_PUBLIC_KEY: process.env.LANGFUSE_PUBLIC_KEY,
    LANGFUSE_SECRET_KEY: process.env.LANGFUSE_SECRET_KEY,
    LANGFUSE_BASE_URL: process.env.LANGFUSE_BASE_URL,
});
const models = createModels();
models.setProvider(opencodeGoProvider());
const catalog = models.getModels('opencode-go');
const modelIds = catalog.map((model) => model.id);
const defaultModel = process.env.DEFAULT_MODEL ?? 'deepseek-v4.1-flash';
const imageModels = new Set(
    catalog.filter((model) => model.input.includes('image')).map((model) => model.id),
);
const settings = createSettings(db, {
    models: modelIds,
    defaultModel,
    defaultShellEnabled: sandboxEnabled,
});
const budgets = createBudgets(db, {
    user: limit('USER_WEEKLY_TOKENS'),
    chat: limit('CHAT_WEEKLY_TOKENS'),
});
const groupReplyAgeMs = (limit('GROUP_REPLY_MAX_AGE_SECONDS') ?? 900) * 1000;
const pending = await pendingRuns(db, groupReplyAgeMs);
const characters = createCharacters({
    db,
    generateNames: createNameGenerator({ models, settings, budgets }),
});
const actions = createAgentActions({
    db,
    api,
    async shell(key, command) {
        if (!sandboxEnabled) throw new Error('Sandbox is disabled');
        const effective = await settings.resolve(key.chatId, 0);
        if (!effective.shellEnabled) throw new Error('Shell is disabled in this chat');
        const result = await sandbox.execute({
            chatId: key.chatId,
            command,
            javascriptEnabled: effective.javascriptEnabled,
        });
        return `${result.stdout}\n${result.stderr}\nExit code: ${result.exitCode}`;
    },
});
const sessions = await createAgentSessions({
    dataDir: resolve(dataDir, 'sessions'),
    models,
    actions: {
        ...actions,
        search: process.env.RADIUS_TOKEN ? createSearch(process.env.RADIUS_TOKEN) : undefined,
    },
    telemetry: tracing.telemetry,
    recoverOnStartup: (key) => resumeRequest(pending, key),
});
await recoverRuns(sessions, budgets, pending);
const processUpdate = createConversationHandler({
    db,
    api,
    botId: me.id,
    botUsername: me.username,
    botToken,
    telegramApiRoot,
    settings,
    sessions,
    budgets,
    characters,
    imageModels,
    adminIds,
    groupReplyAgeMs,
    webAppUrl: process.env.WEB_APP_URL,
    resetFiles: (chatId) => sandbox.resetFiles({ chatId }),
});
const ingestion = createIngestion({
    db,
    processUpdate,
    api: pollingApi(api),
    onError: (error) => console.error('Telegram ingestion:', error),
});
const configHandler = createConfigHandler({ db, botToken, adminIds, settings, api });
const webRoot = resolve('web/build');
const server = Bun.serve({
    hostname: process.env.WEB_HOST ?? '0.0.0.0',
    port: Number(process.env.WEB_PORT ?? 8080),
    async fetch(request) {
        const url = new URL(request.url);
        if (url.pathname === '/healthz') return new Response('ok');
        if (url.pathname === '/api/config') return configHandler(request);
        if (url.pathname.startsWith('/api/')) return new Response('Not found', { status: 404 });
        if (request.method !== 'GET' && request.method !== 'HEAD')
            return new Response('Method not allowed', { status: 405 });
        const path = resolve(webRoot, `.${url.pathname}`);
        if (path !== webRoot && !path.startsWith(`${webRoot}${sep}`))
            return new Response('Not found', { status: 404 });
        const file = Bun.file(path);
        if (await file.exists()) return new Response(file);
        if (
            request.headers.get('accept')?.includes('text/html') &&
            !url.pathname.startsWith('/assets/')
        ) {
            const index = Bun.file(resolve(webRoot, 'index.html'));
            if (await index.exists())
                return new Response(index, { headers: { 'cache-control': 'no-cache' } });
        }
        return new Response('Not found', { status: 404 });
    },
});

await ingestion.start();
const stopBackups = scheduleBackups(
    { databaseUrl, dataDir, backupDir: resolve(process.env.BACKUP_DIR ?? `${dataDir}/backups`) },
    60_000,
    limit('BACKUP_KEEP') ?? 10,
);
console.log(`Slusha started; web listening on ${server.hostname}:${server.port}`);
let stopping = false;
async function stop() {
    if (stopping) return;
    stopping = true;
    await server.stop();
    await stopBackups();
    const stopped = ingestion.stop();
    await sandbox.close();
    await sessions.close();
    await stopped;
    await closeDb();
    await tracing.shutdown();
}
process.once('SIGTERM', () => {
    void stop();
});
process.once('SIGINT', () => {
    void stop();
});
