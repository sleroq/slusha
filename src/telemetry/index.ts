import { LangfuseSpanProcessor } from '@langfuse/otel';
import {
    ROOT_CONTEXT,
    SpanStatusCode,
    trace,
    type Attributes,
    type Link,
    type Span,
    type Tracer,
} from '@opentelemetry/api';
import { BasicTracerProvider } from '@opentelemetry/sdk-trace-base';
import type {
    AttributeValue,
    SpanAttributes,
    SpanLink,
    SpanOptions,
    SpanStatus,
    TelemetryContext,
    TelemetrySpan,
} from '@earendil-works/pi-telemetry';

function isList(
    value: AttributeValue,
): value is readonly string[] | readonly number[] | readonly boolean[] {
    return Array.isArray(value);
}

function attributesFor(attributes?: SpanAttributes): Attributes {
    const result: Attributes = {};
    for (const [key, value] of Object.entries(attributes ?? {})) {
        if (value === undefined) continue;
        if (isList(value)) result[key] = value.slice();
        else result[key] = value;
    }
    return result;
}

function linkFor(link: SpanLink): Link | undefined {
    if (!(link.context instanceof OtelSpan)) return undefined;
    return {
        context: link.context.native.spanContext(),
        attributes: attributesFor(link.attributes),
    };
}

class OtelContext implements TelemetryContext {
    constructor(
        protected tracer: Tracer,
        protected parent?: Span,
    ) {}

    startSpan<T>(
        options: SpanOptions,
        callback: (span: TelemetrySpan) => T | Promise<T>,
    ): Promise<T> {
        const links = options.links?.flatMap((link) => {
            const native = linkFor(link);
            if (native) return [native];
            return [];
        });
        let parent = ROOT_CONTEXT;
        if (this.parent) parent = trace.setSpan(parent, this.parent);
        const native = this.tracer.startSpan(
            options.name,
            { attributes: attributesFor(options.attributes), links },
            parent,
        );
        const span = new OtelSpan(this.tracer, native);
        try {
            return Promise.resolve(callback(span)).then(
                (value) => {
                    span.finish('ok');
                    return value;
                },
                (error) => {
                    span.finish('error');
                    throw error;
                },
            );
        } catch (error) {
            span.finish('error');
            return Promise.reject(error);
        }
    }
}

class OtelSpan extends OtelContext implements TelemetrySpan {
    private settled = false;
    private status?: SpanStatus;

    constructor(
        tracer: Tracer,
        readonly native: Span,
    ) {
        super(tracer, native);
    }

    addLink(link: SpanLink): void {
        if (this.settled) return;
        const native = linkFor(link);
        if (native) this.native.addLink(native);
    }
    addEvent(name: string, attributes?: SpanAttributes): void {
        if (!this.settled) this.native.addEvent(name, attributesFor(attributes));
    }
    setAttributes(attributes: SpanAttributes): void {
        if (!this.settled) this.native.setAttributes(attributesFor(attributes));
    }
    setStatus(status: SpanStatus): void {
        if (!this.settled) this.status = status;
    }
    finish(fallback: 'ok' | 'error'): void {
        this.settled = true;
        const status = this.status?.status ?? fallback;
        if (status === 'ok') this.native.setStatus({ code: SpanStatusCode.OK });
        else this.native.setStatus({ code: SpanStatusCode.ERROR });
        this.native.end();
    }
}

type TelemetryEnv = {
    LANGFUSE_PUBLIC_KEY?: string;
    LANGFUSE_SECRET_KEY?: string;
    LANGFUSE_BASE_URL?: string;
};

type Telemetry = { telemetry?: TelemetryContext; shutdown(): Promise<void> };

export function startTelemetry(env: TelemetryEnv): Telemetry {
    const {
        LANGFUSE_PUBLIC_KEY: publicKey,
        LANGFUSE_SECRET_KEY: secretKey,
        LANGFUSE_BASE_URL: baseUrl,
    } = env;
    if (!publicKey || !secretKey || !baseUrl) return { async shutdown() {} };
    const processor = new LangfuseSpanProcessor({
        publicKey,
        secretKey,
        baseUrl,
        shouldExportSpan: () => true,
        mediaUploadEnabled: false,
    });
    const provider = new BasicTracerProvider({ spanProcessors: [processor] });
    return {
        telemetry: new OtelContext(provider.getTracer('slusha.pi-durable')),
        shutdown: () => provider.shutdown(),
    };
}
