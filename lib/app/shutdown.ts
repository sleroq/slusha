import logger from '../logger.ts';
import type { RunnerHandle } from '@grammyjs/runner';
import type { NodeSDK } from '@opentelemetry/sdk-node';
import { shutdownTelemetry } from './observability.ts';

type ShutdownResources = {
    runner: RunnerHandle;
    webServer: Deno.HttpServer;
    stopSchedulers: () => void;
    sdk?: NodeSDK;
};

export function wireShutdown({
    runner,
    webServer,
    stopSchedulers,
    sdk,
}: ShutdownResources) {
    let shuttingDown = false;

    async function gracefulShutdown() {
        if (shuttingDown) {
            return;
        }

        shuttingDown = true;
        logger.info('Shutting down');
        stopSchedulers();

        const [webServerResult, runnerResult] = await Promise.allSettled([
            webServer.shutdown(),
            runner.stop(),
        ]);

        if (webServerResult.status === 'rejected') {
            logger.error(
                'Could not shut down web server: ',
                webServerResult.reason,
            );
        }

        if (runnerResult.status === 'rejected') {
            logger.error('Could not stop bot runner: ', runnerResult.reason);
        }

        try {
            await shutdownTelemetry(sdk);
        } catch (error) {
            logger.error('Could not shutdown SDK: ', error);
        }

        Deno.exit();
    }

    Deno.addSignalListener('SIGINT', gracefulShutdown);
    Deno.addSignalListener('SIGTERM', gracefulShutdown);
}
