import AbortController from 'abort-controller';
import type { Api } from 'grammy';
import type { IngestionApi } from './ingestion';

export function pollingApi(api: Api): IngestionApi {
    return {
        async getUpdates(options, signal) {
            const controller = new AbortController();
            function abort() {
                controller.abort();
            }
            if (signal?.aborted) abort();
            else signal?.addEventListener('abort', abort, { once: true });
            try {
                return await api.getUpdates(options, controller.signal);
            } finally {
                signal?.removeEventListener('abort', abort);
            }
        },
    };
}
