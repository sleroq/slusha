import {
    prometheusContentType,
    renderPrometheusMetrics,
} from '../app/metrics.ts';
import type { Config } from '../config.ts';
import logger from '../logger.ts';
import { type Route, route } from '@std/http/unstable-route';
import { serveDir } from '@std/http/file-server';
import { createConfigHandler } from './config-handler.ts';

function createRoutes(botToken: string, devServerUrl?: string): Route[] {
    const configHandler = createConfigHandler(botToken);
    const frontendHandler = (req: Request) => {
        if (devServerUrl) {
            const requestUrl = new URL(req.url);
            const targetUrl = new URL(
                `${requestUrl.pathname}${requestUrl.search}`,
                devServerUrl,
            );
            const headers = new Headers(req.headers);

            headers.delete('host');
            headers.delete('connection');

            return fetch(
                new Request(targetUrl, {
                    method: req.method,
                    headers,
                    body: req.body,
                }),
            );
        }

        return serveDir(req, { fsRoot: './web/build' });
    };

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
            pattern: new URLPattern({ pathname: '/api/config' }),
            method: 'GET',
            handler: configHandler,
        },
        {
            pattern: new URLPattern({ pathname: '/api/config' }),
            method: 'PUT',
            handler: configHandler,
        },
        {
            pattern: new URLPattern({ pathname: '/' }),
            handler: frontendHandler,
        },
        {
            pattern: new URLPattern({ pathname: '/:path*' }),
            handler: frontendHandler,
        },
    ];
}

export function startWebServer(config: Config) {
    const port = Number(Deno.env.get('WEB_PORT') ?? '8080');
    const hostname = Deno.env.get('WEB_HOST') ?? '0.0.0.0';
    const devServerUrl = Deno.env.get('WEB_DEV_SERVER_URL');

    const server = Deno.serve(
        { port, hostname },
        route(
            createRoutes(config.botToken, devServerUrl),
            () => new Response('Not found', { status: 404 }),
        ),
    );

    logger.info(`Web server started on ${hostname}:${port}`);

    return server;
}
