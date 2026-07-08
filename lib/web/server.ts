import {
    prometheusContentType,
    renderPrometheusMetrics,
} from '../app/metrics.ts';
import logger from '../logger.ts';

export function startWebServer() {
    const port = Number(Deno.env.get('WEB_PORT') ?? '8080');
    const hostname = Deno.env.get('WEB_HOST') ?? '0.0.0.0';

    const server = Deno.serve({ port, hostname }, async (req) => {
        const url = new URL(req.url);

        let response: Response;
        try {
            response = await (async () => {
                if (url.pathname === '/healthz') {
                    return new Response('ok');
                }

                if (url.pathname === '/metrics') {
                    return new Response(await renderPrometheusMetrics(), {
                        status: 200,
                        headers: {
                            'content-type': prometheusContentType,
                            'cache-control': 'no-store',
                        },
                    });
                }

                return new Response('Not found', { status: 404 });
            })();
        } catch (error) {
            logger.error('Unhandled web server error: ', error);
            response = new Response(
                JSON.stringify({ error: 'Internal server error' }),
                {
                    status: 500,
                    headers: {
                        'content-type': 'application/json; charset=utf-8',
                    },
                },
            );
        }

        return response;
    });

    logger.info(`Web server started on ${hostname}:${port}`);

    return server;
}
