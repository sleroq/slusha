import { extname, join, normalize } from 'node:path';
import { Bot } from 'grammy';
import {
    Config,
    getGlobalUserConfig,
    mergeWithChatOverride,
    parseChatOverridePayload,
    parseUserConfigPayload,
    serializeChatOverride,
    serializeUserConfig,
    setGlobalUserConfig,
    UserConfig,
} from '../config.ts';
import { SlushaContext } from '../telegram/setup-bot.ts';
import {
    canEditChatConfig,
    canEditGlobalConfig,
    resolveConfigRole,
} from './permissions.ts';
import {
    buildBootstrapCapabilities,
    getModelOptionsForRole,
    projectEffectiveConfigForRole,
    projectGlobalConfigForRole,
    sanitizeChatOverrideForRole,
} from './config-policy.ts';
import { verifyTelegramInitData } from './auth.ts';
import logger from '../logger.ts';
import { ChatMemory, Memory } from '../memory.ts';

interface RuntimeConfigAccess {
    get: () => Config;
    applyUserConfig: (value: UserConfig) => void;
}

interface StartWebServerOptions {
    bot: Bot<SlushaContext>;
    memory: Memory;
    runtimeConfig: RuntimeConfigAccess;
}

function jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: {
            'content-type': 'application/json; charset=utf-8',
        },
    });
}

function pickInitData(req: Request): string {
    const custom = req.headers.get('x-telegram-init-data');
    if (custom) return custom;

    const auth = req.headers.get('authorization');
    if (auth?.startsWith('tma ')) {
        return auth.slice(4).trim();
    }

    return '';
}

function contentType(filePath: string): string {
    const ext = extname(filePath).toLowerCase();
    if (ext === '.html') return 'text/html; charset=utf-8';
    if (ext === '.js') return 'application/javascript; charset=utf-8';
    if (ext === '.css') return 'text/css; charset=utf-8';
    if (ext === '.json') return 'application/json; charset=utf-8';
    if (ext === '.svg') return 'image/svg+xml';
    if (ext === '.png') return 'image/png';
    if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
    if (ext === '.ico') return 'image/x-icon';
    return 'application/octet-stream';
}

async function serveWidgetAsset(
    pathname: string,
): Promise<Response | undefined> {
    if (!pathname.startsWith('/widget')) return undefined;

    const baseDir = normalize(join(Deno.cwd(), 'widget', 'dist'));
    const relPath = pathname.replace(/^\/widget\/?/, '');
    const requested = relPath.length > 0 ? relPath : 'index.html';
    const target = normalize(join(baseDir, requested));

    if (!target.startsWith(baseDir)) {
        return new Response('Forbidden', { status: 403 });
    }

    try {
        const data = await Deno.readFile(target);
        return new Response(data, {
            status: 200,
            headers: { 'content-type': contentType(target) },
        });
    } catch {
        if (pathname.startsWith('/widget/')) {
            try {
                const indexPath = join(baseDir, 'index.html');
                const html = await Deno.readFile(indexPath);
                return new Response(html, {
                    status: 200,
                    headers: { 'content-type': 'text/html; charset=utf-8' },
                });
            } catch {
                return new Response('Widget is not built', { status: 503 });
            }
        }

        return new Response('Not found', { status: 404 });
    }
}

export function startWebServer(options: StartWebServerOptions) {
    const port = Number(Deno.env.get('WEB_PORT') ?? '8080');
    const hostname = Deno.env.get('WEB_HOST') ?? '0.0.0.0';

    const server = Deno.serve({ port, hostname }, async (req) => {
        const url = new URL(req.url);

        if (req.method === 'GET') {
            const staticResponse = await serveWidgetAsset(url.pathname);
            if (staticResponse) return staticResponse;
        }

        if (url.pathname === '/healthz') {
            return new Response('ok');
        }

        if (!url.pathname.startsWith('/api/config/')) {
            return new Response('Not found', { status: 404 });
        }

        try {
            const initData = pickInitData(req);
            const verified = await verifyTelegramInitData(
                initData,
                options.runtimeConfig.get().botToken,
            );
            const userId = verified.user?.id;
            const runtimeConfig = options.runtimeConfig.get();
            const role = resolveConfigRole(runtimeConfig, userId);

            if (
                url.pathname === '/api/config/bootstrap' && req.method === 'GET'
            ) {
                const chatIdRaw = url.searchParams.get('chatId');
                const chatId = chatIdRaw ? Number(chatIdRaw) : undefined;

                const globalConfig = await getGlobalUserConfig(
                    options.memory.db,
                );
                const canEditGlobal = canEditGlobalConfig(
                    runtimeConfig,
                    userId,
                );
                const canViewGlobal = canEditGlobal;
                const serializedGlobalConfig = JSON.parse(
                    serializeUserConfig(globalConfig),
                ) as UserConfig;
                const globalPayload = projectGlobalConfigForRole(
                    serializedGlobalConfig,
                    role,
                );

                let chatOverridePayload: unknown = undefined;
                let effectiveConfigPayload: unknown = undefined;
                let canEditChat = false;

                if (chatId !== undefined && Number.isFinite(chatId)) {
                    canEditChat = await canEditChatConfig(
                        options.bot,
                        chatId,
                        userId,
                    );
                    if (canEditChat) {
                        const chat = await options.bot.api.getChat(chatId);
                        const chatMemory = new ChatMemory(options.memory, chat);
                        const chatOverride = await chatMemory
                            .getChatConfigOverride();
                        chatOverridePayload = chatOverride
                            ? JSON.parse(
                                serializeChatOverride(
                                    sanitizeChatOverrideForRole(
                                        chatOverride,
                                        role,
                                        globalConfig,
                                        false,
                                    ),
                                ),
                            )
                            : {};

                        const effectiveConfig = mergeWithChatOverride(
                            globalConfig,
                            chatOverride,
                        );
                        const serializedEffectiveConfig = JSON.parse(
                            serializeUserConfig(effectiveConfig),
                        ) as UserConfig;
                        effectiveConfigPayload = projectEffectiveConfigForRole(
                            serializedEffectiveConfig,
                            role,
                        );
                    }
                }

                const capabilities = buildBootstrapCapabilities(role);

                return jsonResponse({
                    role: capabilities.role,
                    categories: capabilities.categories,
                    availableModels: getModelOptionsForRole(globalConfig, role),
                    canViewGlobal,
                    canEditGlobal,
                    canEditChat,
                    globalPayload,
                    chatOverridePayload,
                    effectiveConfigPayload,
                });
            }

            if (url.pathname === '/api/config/global' && req.method === 'PUT') {
                if (!canEditGlobalConfig(runtimeConfig, userId)) {
                    return jsonResponse({ error: 'Forbidden' }, 403);
                }

                const body = await req.json() as { payload?: unknown };
                if (!body.payload) {
                    return jsonResponse({ error: 'Missing payload' }, 400);
                }

                const parsed = parseUserConfigPayload(
                    JSON.stringify(body.payload),
                );
                const saved = await setGlobalUserConfig(
                    parsed,
                    userId,
                    options.memory.db,
                );
                options.runtimeConfig.applyUserConfig(saved);

                return jsonResponse({ ok: true });
            }

            if (
                url.pathname.startsWith('/api/config/chat/') &&
                req.method === 'PUT'
            ) {
                const chatIdRaw = url.pathname.replace('/api/config/chat/', '');
                const chatId = Number(chatIdRaw);
                if (!Number.isFinite(chatId)) {
                    return jsonResponse({ error: 'Invalid chat id' }, 400);
                }

                const allowed = await canEditChatConfig(
                    options.bot,
                    chatId,
                    userId,
                );
                if (!allowed) {
                    return jsonResponse({ error: 'Forbidden' }, 403);
                }

                const body = await req.json() as { payload?: unknown };
                if (!body.payload) {
                    return jsonResponse({ error: 'Missing payload' }, 400);
                }

                const parsedOverride = parseChatOverridePayload(
                    JSON.stringify(body.payload),
                );
                const globalConfig = await getGlobalUserConfig(
                    options.memory.db,
                );
                const sanitizedOverride = sanitizeChatOverrideForRole(
                    parsedOverride,
                    role,
                    globalConfig,
                );
                const chatMemory = new ChatMemory(
                    options.memory,
                    await options.bot.api.getChat(chatId),
                );
                await chatMemory.setChatConfigOverride(
                    sanitizedOverride,
                    userId,
                );

                return jsonResponse({ ok: true });
            }

            return new Response('Not found', { status: 404 });
        } catch (error) {
            logger.error('Web API error: ', error);
            const message = error instanceof Error
                ? error.message
                : 'Unknown error';
            return jsonResponse({ error: message }, 400);
        }
    });

    logger.info(`Web server started on ${hostname}:${port}`);

    return server;
}
