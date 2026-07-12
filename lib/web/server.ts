import {
    prometheusContentType,
    renderPrometheusMetrics,
} from '../app/metrics.ts';
import type { Config } from '../config.ts';
import logger from '../logger.ts';
import { withTelegramAuth } from './telegram-auth.ts';
import { type Route, route } from '@std/http/unstable-route';
import { serveDir } from '@std/http/file-server';

function json(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
    });
}

function createRoutes(botToken: string): Route[] {
    return [
        {
            pattern: new URLPattern({ pathname: '/healthz' }),
            handler: () => new Response('ok'),
        },
        {
            pattern: new URLPattern({ pathname: '/metrics' }),
            handler: async () =>
                new Response(await renderPrometheusMetrics(), {
                    status: 200,
                    headers: {
                        'content-type': prometheusContentType,
                        'cache-control': 'no-store',
                    },
                }),
        },
        {
            pattern: new URLPattern({ pathname: '/api/auth/telegram' }),
            method: 'POST',
            handler: withTelegramAuth(botToken, (_request, initData) => {
                if (!initData.user) {
                    return new Response('Unauthorized', { status: 401 });
                }
                return json({ user: initData.user });
            }),
        },
        {
            pattern: new URLPattern({ pathname: '/' }),
            handler: (req) => serveDir(req, { fsRoot: './web/build' }),
        },
    ];
}

export function startWebServer(config: Config) {
    const port = Number(Deno.env.get('WEB_PORT') ?? '8080');
    const hostname = Deno.env.get('WEB_HOST') ?? '0.0.0.0';

    const server = Deno.serve(
        { port, hostname },
        route(
            createRoutes(config.botToken),
            () => new Response('Not found', { status: 404 }),
        ),
    );

    logger.info(`Web server started on ${hostname}:${port}`);

    return server;
}
