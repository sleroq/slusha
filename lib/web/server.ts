import { extname, join, normalize } from 'node:path';
import {
    httpRequestDurationSeconds,
    httpRequestsTotal,
    renderPrometheusMetrics,
    statusClass,
} from '../app/metrics.ts';
import logger from '../logger.ts';
import { jsonResponse } from './http.ts';
import { handleBootstrapRequest } from './handlers/bootstrap.ts';
import { handlePutChatConfigRequest } from './handlers/chat-config.ts';
import { handlePutChatInternalsRequest } from './handlers/chat-internals.ts';
import { handlePutGlobalConfigRequest } from './handlers/global-config.ts';
import { resolveRequestContext } from './request-context.ts';
import {
    parseChatConfigChatId,
    parseChatInternalsChatId,
    resolveRouteTemplate,
} from './routes.ts';
import { StartWebServerOptions } from './types.ts';

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

async function dispatchApiConfigRoute(
    req: Request,
    url: URL,
    options: StartWebServerOptions,
): Promise<Response> {
    const { pathname } = url;

    if (pathname === '/api/config/bootstrap') {
        const context = await resolveRequestContext(req, options);
        return await handleBootstrapRequest(req, url, options, context);
    }

    if (pathname === '/api/config/global' && req.method === 'PUT') {
        const context = await resolveRequestContext(req, options);
        return await handlePutGlobalConfigRequest(req, options, context);
    }

    const internalsChatId = parseChatInternalsChatId(pathname);
    if (internalsChatId !== undefined && req.method === 'PUT') {
        const context = await resolveRequestContext(req, options);
        return await handlePutChatInternalsRequest(
            req,
            options,
            context,
            internalsChatId,
        );
    }

    const chatConfigId = parseChatConfigChatId(pathname);
    if (chatConfigId !== undefined && req.method === 'PUT') {
        const context = await resolveRequestContext(req, options);
        return await handlePutChatConfigRequest(
            req,
            options,
            context,
            chatConfigId,
        );
    }

    return new Response('Not found', { status: 404 });
}

export function startWebServer(options: StartWebServerOptions) {
    const port = Number(Deno.env.get('WEB_PORT') ?? '8080');
    const hostname = Deno.env.get('WEB_HOST') ?? '0.0.0.0';

    const server = Deno.serve({ port, hostname }, async (req) => {
        const startedAt = performance.now();
        const url = new URL(req.url);
        const routeTemplate = resolveRouteTemplate(url.pathname);

        let response: Response;
        try {
            response = await (async () => {
                if (req.method === 'GET') {
                    const staticResponse = await serveWidgetAsset(url.pathname);
                    if (staticResponse) return staticResponse;
                }

                if (url.pathname === '/healthz') {
                    return new Response('ok');
                }

                if (url.pathname === '/metrics') {
                    return new Response(renderPrometheusMetrics(), {
                        status: 200,
                        headers: {
                            'content-type':
                                'text/plain; version=0.0.4; charset=utf-8',
                            'cache-control': 'no-store',
                        },
                    });
                }

                if (!url.pathname.startsWith('/api/config/')) {
                    return new Response('Not found', { status: 404 });
                }

                try {
                    return await dispatchApiConfigRoute(req, url, options);
                } catch (error) {
                    logger.error('Web API error: ', error);
                    const message = error instanceof Error
                        ? error.message
                        : 'Unknown error';
                    return jsonResponse({ error: message }, 400);
                }
            })();
        } catch (error) {
            logger.error('Unhandled web server error: ', error);
            response = jsonResponse({ error: 'Internal server error' }, 500);
        }

        const status = statusClass(response.status);
        const durationSeconds = (performance.now() - startedAt) / 1000;
        httpRequestsTotal.inc({
            route: routeTemplate,
            method: req.method,
            status_class: status,
        });
        httpRequestDurationSeconds.observe({
            route: routeTemplate,
            method: req.method,
            status_class: status,
        }, durationSeconds);

        return response;
    });

    logger.info(`Web server started on ${hostname}:${port}`);

    return server;
}
