import { expect, test } from 'bun:test';
import { BACKGROUND_CONTEXT } from '@earendil-works/chord/context';
import { createModels, fauxAssistantMessage, fauxProvider } from '@earendil-works/pi-ai';
import { createRegistry, Harness, MemoryStorage } from '@earendil-works/pi-durable';
import { startTelemetry } from './index';

test('exports the durable and model span tree on shutdown without exposing message content', async () => {
    const disabled = startTelemetry({ LANGFUSE_PUBLIC_KEY: 'test', LANGFUSE_SECRET_KEY: 'test' });
    expect(disabled.telemetry).toBeUndefined();
    await disabled.shutdown();
    const requests: { path: string; authorization: string | null; body: string }[] = [];
    const server = Bun.serve({ port: 0, hostname: '127.0.0.1', async fetch(request) {
        requests.push({ path: new URL(request.url).pathname, authorization: request.headers.get('authorization'), body: await request.text() });
        return Response.json({});
    } });
    const tracing = startTelemetry({ LANGFUSE_PUBLIC_KEY: 'test-public', LANGFUSE_SECRET_KEY: 'test-secret', LANGFUSE_BASE_URL: server.url.origin });

    let callbackSpan: import('@earendil-works/pi-telemetry').TelemetrySpan | undefined;
    await tracing.telemetry!.startSpan({ name: 'host.operation', attributes: { count: 1 } }, async (span) => {
        callbackSpan = span;
        span.setAttributes({ count: 2, ignored: undefined });
        span.addEvent('host.ready', { ready: true });
        span.setStatus({ status: 'error' });
        span.setStatus({ status: 'ok' });
        await span.startSpan({ name: 'host.child' }, () => {});
    });
    callbackSpan!.addEvent('too.late');

    const faux = fauxProvider({ provider: 'test', models: [{ id: 'model' }] });
    faux.setResponses([fauxAssistantMessage('private response')]);
    const models = createModels();
    models.setProvider(faux.provider);

    const harness = await Harness.open(new MemoryStorage(), { models, registry: createRegistry(), telemetry: tracing.telemetry }, BACKGROUND_CONTEXT);
    try {
        const root = await harness.root(BACKGROUND_CONTEXT, { agent: { model: { provider: 'test', modelId: 'model' } } });
        const submission = await root.submit({ type: 'input', content: 'private prompt' }, BACKGROUND_CONTEXT);
        expect((await submission.wait(BACKGROUND_CONTEXT)).status).toBe('done');
        await harness.waitForIdle(BACKGROUND_CONTEXT);
    } finally {
        await harness.close(BACKGROUND_CONTEXT);
        await tracing.shutdown();
        server.stop();
    }

    expect(requests.length).toBeGreaterThan(0);
    expect(requests[0]?.path).toBe('/api/public/otel/v1/traces');
    expect(requests[0]?.authorization).toBe(`Basic ${btoa('test-public:test-secret')}`);
    const body = requests.map((request) => request.body).join('');
    expect(body).not.toContain('private prompt');
    expect(body).not.toContain('private response');
    expect(body).not.toContain('test-secret');

    const spans = requests.flatMap((request) => JSON.parse(request.body).resourceSpans.flatMap((resource: any) => resource.scopeSpans.flatMap((scope: any) => scope.spans)));
    const host = spans.find((span: any) => span.name === 'host.operation');
    const child = spans.find((span: any) => span.name === 'host.child');
    expect(child.parentSpanId).toBe(host.spanId);
    expect(host.status.code).toBe(1);
    expect(host.attributes.find((attribute: any) => attribute.key === 'count').value.intValue).toBe(2);
    expect(host.events.map((event: any) => event.name)).toEqual(['host.ready']);
    const model = spans.find((span: any) => span.name.startsWith('pi.ai.'));
    expect(model).toBeDefined();
    const parent = spans.find((span: any) => span.spanId === model.parentSpanId && span.traceId === model.traceId);
    expect(parent).toBeDefined();
    expect(parent.name.startsWith('pi.durable.')).toBe(true);
});

