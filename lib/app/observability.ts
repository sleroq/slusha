import type { NodeSDK } from '@opentelemetry/sdk-node';

function hasLangfuseConfig(): boolean {
    return [
        'LANGFUSE_SECRET_KEY',
        'LANGFUSE_PUBLIC_KEY',
        'LANGFUSE_BASE_URL',
    ].every((key) => {
        const value = Deno.env.get(key);
        return typeof value === 'string' && value.trim().length > 0;
    });
}

export async function startTelemetry(): Promise<NodeSDK | undefined> {
    if (!hasLangfuseConfig()) {
        return undefined;
    }

    // Not loading telemetry dependencies into memory if it's not configured
    const [
        { NodeSDK },
        { getNodeAutoInstrumentations },
        { LangfuseSpanProcessor },
        { registerTelemetry },
        { LangfuseVercelAiSdkIntegration },
    ] = await Promise.all([
        import('@opentelemetry/sdk-node'),
        import('@opentelemetry/auto-instrumentations-node'),
        import('@langfuse/otel'),
        import('ai'),
        import('@langfuse/vercel-ai-sdk'),
    ]);

    const sdk = new NodeSDK({
        spanProcessors: [new LangfuseSpanProcessor()],
        instrumentations: [getNodeAutoInstrumentations()],
    });
    sdk.start();
    registerTelemetry(new LangfuseVercelAiSdkIntegration());
    return sdk;
}

export async function shutdownTelemetry(sdk?: NodeSDK) {
    if (!sdk) {
        return;
    }

    await sdk.shutdown();
}
