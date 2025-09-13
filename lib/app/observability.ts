import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { LangfuseExporter } from 'langfuse-vercel';

export function startTelemetry() {
    const sdk = new NodeSDK({
        traceExporter: new LangfuseExporter(),
        instrumentations: [getNodeAutoInstrumentations()],
    });
    sdk.start();
    return sdk;
}

export async function shutdownTelemetry(sdk: NodeSDK) {
    await sdk.shutdown();
}
