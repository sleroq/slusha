type Labels = Record<string, string>;

type MetricKind = 'counter' | 'gauge' | 'histogram';

interface MetricDefinition {
    name: string;
    help: string;
    labelNames: string[];
    kind: MetricKind;
}

function escapeLabelValue(value: string): string {
    return value
        .replaceAll('\\', '\\\\')
        .replaceAll('\n', '\\n')
        .replaceAll('"', '\\"');
}

function labelsKey(labelNames: string[], labels: Labels): string {
    return labelNames.map((name) => `${name}=${labels[name] ?? ''}`).join('|');
}

function labelsSuffix(labelNames: string[], labels: Labels): string {
    if (labelNames.length === 0) {
        return '';
    }

    const pairs = labelNames.map((name) => {
        const value = escapeLabelValue(labels[name] ?? '');
        return `${name}="${value}"`;
    });
    return `{${pairs.join(',')}}`;
}

class Counter {
    readonly definition: MetricDefinition;
    #series = new Map<string, { labels: Labels; value: number }>();

    constructor(name: string, help: string, labelNames: string[]) {
        this.definition = {
            name,
            help,
            labelNames,
            kind: 'counter',
        };
    }

    inc(labels: Labels = {}, value = 1): void {
        if (!Number.isFinite(value) || value < 0) {
            return;
        }

        const key = labelsKey(this.definition.labelNames, labels);
        const existing = this.#series.get(key);
        if (existing) {
            existing.value += value;
            return;
        }

        this.#series.set(key, {
            labels: { ...labels },
            value,
        });
    }

    renderLines(): string[] {
        const lines: string[] = [];
        for (const { labels, value } of this.#series.values()) {
            lines.push(
                `${this.definition.name}${
                    labelsSuffix(this.definition.labelNames, labels)
                } ${value}`,
            );
        }
        return lines;
    }
}

class Gauge {
    readonly definition: MetricDefinition;
    #series = new Map<string, { labels: Labels; value: number }>();

    constructor(name: string, help: string, labelNames: string[]) {
        this.definition = {
            name,
            help,
            labelNames,
            kind: 'gauge',
        };
    }

    set(labels: Labels = {}, value: number): void {
        if (!Number.isFinite(value)) {
            return;
        }

        const key = labelsKey(this.definition.labelNames, labels);
        this.#series.set(key, {
            labels: { ...labels },
            value,
        });
    }

    renderLines(): string[] {
        const lines: string[] = [];
        for (const { labels, value } of this.#series.values()) {
            lines.push(
                `${this.definition.name}${
                    labelsSuffix(this.definition.labelNames, labels)
                } ${value}`,
            );
        }
        return lines;
    }
}

class Histogram {
    readonly definition: MetricDefinition;
    readonly #buckets: number[];
    #series = new Map<
        string,
        { labels: Labels; buckets: number[]; sum: number; count: number }
    >();

    constructor(
        name: string,
        help: string,
        labelNames: string[],
        buckets: number[],
    ) {
        this.definition = {
            name,
            help,
            labelNames,
            kind: 'histogram',
        };
        const unique = [...new Set(buckets)].filter((bucket) => bucket > 0)
            .sort((left, right) => left - right);
        this.#buckets = unique;
    }

    observe(labels: Labels = {}, value: number): void {
        if (!Number.isFinite(value) || value < 0) {
            return;
        }

        const key = labelsKey(this.definition.labelNames, labels);
        let entry = this.#series.get(key);
        if (!entry) {
            entry = {
                labels: { ...labels },
                buckets: this.#buckets.map(() => 0),
                sum: 0,
                count: 0,
            };
            this.#series.set(key, entry);
        }

        entry.count += 1;
        entry.sum += value;
        for (let index = 0; index < this.#buckets.length; index++) {
            if (value <= this.#buckets[index]) {
                entry.buckets[index] += 1;
            }
        }
    }

    renderLines(): string[] {
        const lines: string[] = [];
        const labelNamesWithLe = [...this.definition.labelNames, 'le'];

        for (const { labels, buckets, sum, count } of this.#series.values()) {
            for (let index = 0; index < this.#buckets.length; index++) {
                lines.push(
                    `${this.definition.name}_bucket${
                        labelsSuffix(labelNamesWithLe, {
                            ...labels,
                            le: String(this.#buckets[index]),
                        })
                    } ${buckets[index]}`,
                );
            }

            lines.push(
                `${this.definition.name}_bucket${
                    labelsSuffix(labelNamesWithLe, { ...labels, le: '+Inf' })
                } ${count}`,
            );
            lines.push(
                `${this.definition.name}_sum${
                    labelsSuffix(this.definition.labelNames, labels)
                } ${sum}`,
            );
            lines.push(
                `${this.definition.name}_count${
                    labelsSuffix(this.definition.labelNames, labels)
                } ${count}`,
            );
        }

        return lines;
    }
}

const metricFamilies: Array<Counter | Gauge | Histogram> = [];

function registerMetric<T extends Counter | Gauge | Histogram>(metric: T): T {
    metricFamilies.push(metric);
    return metric;
}

export const httpRequestsTotal = registerMetric(
    new Counter(
        'slusha_http_requests_total',
        'Total HTTP requests handled by the web server',
        ['route', 'method', 'status_class'],
    ),
);

export const httpRequestDurationSeconds = registerMetric(
    new Histogram(
        'slusha_http_request_duration_seconds',
        'HTTP request duration in seconds',
        ['route', 'method', 'status_class'],
        [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10],
    ),
);

export const telegramUpdatesTotal = registerMetric(
    new Counter(
        'slusha_telegram_updates_total',
        'Total Telegram updates processed by update type',
        ['update_type'],
    ),
);

export const telegramHandlerErrorsTotal = registerMetric(
    new Counter(
        'slusha_telegram_handler_errors_total',
        'Total Telegram handler errors by update type and error kind',
        ['update_type', 'error_type'],
    ),
);

export const aiRequestsTotal = registerMetric(
    new Counter(
        'slusha_ai_requests_total',
        'Total AI generation requests by task and model metadata',
        ['task', 'provider', 'model_ref', 'reply_method', 'downgraded'],
    ),
);

export const aiRequestDurationSeconds = registerMetric(
    new Histogram(
        'slusha_ai_request_duration_seconds',
        'AI generation duration in seconds',
        ['task', 'provider', 'model_ref', 'reply_method', 'downgraded'],
        [0.1, 0.25, 0.5, 1, 2, 5, 10, 20, 30, 60],
    ),
);

export const aiFailuresTotal = registerMetric(
    new Counter(
        'slusha_ai_failures_total',
        'Total AI generation failures by task and model metadata',
        [
            'task',
            'provider',
            'model_ref',
            'reply_method',
            'downgraded',
            'error_type',
        ],
    ),
);

export const aiFinishReasonTotal = registerMetric(
    new Counter(
        'slusha_ai_finish_reason_total',
        'Total AI completion finish reasons',
        [
            'task',
            'provider',
            'model_ref',
            'reply_method',
            'downgraded',
            'finish_reason',
        ],
    ),
);

export const aiTokensTotal = registerMetric(
    new Counter(
        'slusha_ai_tokens_total',
        'Total AI token usage by token type',
        ['task', 'provider', 'model_ref', 'token_type'],
    ),
);

export const rateLimitExceededTotal = registerMetric(
    new Counter(
        'slusha_rate_limit_exceeded_total',
        'Total rate-limit exceed events by limiter and scope',
        ['limiter', 'scope'],
    ),
);

export const usageEventsRecordedTotal = registerMetric(
    new Counter(
        'slusha_usage_events_recorded_total',
        'Total usage window events recorded',
        ['has_user_id'],
    ),
);

export const usageCleanupRunsTotal = registerMetric(
    new Counter(
        'slusha_usage_cleanup_runs_total',
        'Total usage window cleanup runs',
        [],
    ),
);

export const usageDowngradedTotal = registerMetric(
    new Counter(
        'slusha_usage_downgraded_total',
        'Total downgraded usage snapshots',
        ['tier', 'reason'],
    ),
);

export const processUptimeSeconds = registerMetric(
    new Gauge(
        'slusha_process_uptime_seconds',
        'Process uptime in seconds',
        [],
    ),
);

export const processResidentMemoryBytes = registerMetric(
    new Gauge(
        'slusha_process_resident_memory_bytes',
        'Process resident memory in bytes',
        [],
    ),
);

const processStartedAt = Date.now();

export function statusClass(status: number): string {
    const classCode = Math.floor(status / 100);
    if (classCode < 1 || classCode > 5) {
        return 'unknown';
    }
    return `${classCode}xx`;
}

export function errorType(error: unknown): string {
    if (error instanceof Error) {
        const name = error.name.trim();
        return name.length > 0 ? name : 'Error';
    }
    return typeof error;
}

function updateProcessMetrics(): void {
    processUptimeSeconds.set({}, (Date.now() - processStartedAt) / 1000);
    processResidentMemoryBytes.set({}, Deno.memoryUsage().rss);
}

export function renderPrometheusMetrics(): string {
    updateProcessMetrics();
    const lines: string[] = [];
    for (const metric of metricFamilies) {
        lines.push(
            `# HELP ${metric.definition.name} ${metric.definition.help}`,
        );
        lines.push(
            `# TYPE ${metric.definition.name} ${metric.definition.kind}`,
        );
        lines.push(...metric.renderLines());
    }
    return `${lines.join('\n')}\n`;
}
