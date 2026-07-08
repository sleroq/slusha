import {
    prometheusContentType,
    renderPrometheusMetrics,
} from '../app/metrics.ts';
import logger from '../logger.ts';
import { type Route, route } from '@std/http/unstable-route';

const routes: Route[] = [
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
];

export function startWebServer() {
    const port = Number(Deno.env.get('WEB_PORT') ?? '8080');
    const hostname = Deno.env.get('WEB_HOST') ?? '0.0.0.0';

    const server = Deno.serve(
        { port, hostname },
        route(routes, () => new Response('Not found', { status: 404 })),
    );

    logger.info(`Web server started on ${hostname}:${port}`);

    return server;
}
