/**
 * Minimal Prometheus text-format metrics registry (no runtime dependency).
 *
 * Scope: counters, histograms (fixed buckets) and gauges rendered in the
 * Prometheus text exposition format 0.0.4. Cardinality is deliberately
 * bounded — labels must never carry PII (user ids, phone numbers, message
 * content). See issue #178.
 */

export type MetricLabels = Record<string, string>;

const HTTP_DURATION_BUCKETS_MS = [10, 50, 100, 250, 500, 1000, 2500, 5000, 10000];

function seriesKey(name: string, labels: MetricLabels | undefined): string {
  const normalized = labels ?? {};
  const keys = Object.keys(normalized).sort();
  if (keys.length === 0) {
    return name;
  }
  const parts = keys.map((k) => `${k}=${normalized[k]}`);
  return `${name}|${parts.join('|')}`;
}

function escapeLabelValue(value: string): string {
  return value.replaceAll('\\', '\\\\').replaceAll('"', '\\"').replaceAll('\n', '\\n');
}

function formatLabels(labels: MetricLabels | undefined): string {
  const keys = Object.keys(labels ?? {});
  if (keys.length === 0) {
    return '';
  }
  const rendered = keys.sort().map((k) => `${k}="${escapeLabelValue(labels?.[k] ?? '')}"`);
  return `{${rendered.join(',')}}`;
}

interface CounterSeries {
  labels: MetricLabels;
  value: number;
}

export class Counter {
  private readonly series = new Map<string, CounterSeries>();

  constructor(
    readonly name: string,
    readonly help: string
  ) {}

  inc(labels?: MetricLabels, delta = 1): void {
    const key = seriesKey(this.name, labels);
    const current = this.series.get(key) ?? { labels: labels ?? {}, value: 0 };
    current.value += delta;
    this.series.set(key, current);
  }

  reset(): void {
    this.series.clear();
  }

  render(): string {
    const lines = [`# HELP ${this.name} ${this.help}`, `# TYPE ${this.name} counter`];
    for (const s of this.series.values()) {
      lines.push(`${this.name}${formatLabels(s.labels)} ${s.value}`);
    }
    return lines.join('\n');
  }
}

interface HistogramSeries {
  labels: MetricLabels;
  buckets: number[];
  count: number;
  sum: number;
}

export class Histogram {
  private readonly series = new Map<string, HistogramSeries>();

  constructor(
    readonly name: string,
    readonly help: string,
    readonly buckets: readonly number[] = HTTP_DURATION_BUCKETS_MS
  ) {}

  private newSeries(labels: MetricLabels | undefined): HistogramSeries {
    return { labels: labels ?? {}, buckets: this.buckets.map(() => 0), count: 0, sum: 0 };
  }

  observe(labels: MetricLabels | undefined, value: number): void {
    const key = seriesKey(this.name, labels);
    const current = this.series.get(key) ?? this.newSeries(labels);
    for (const [i, upper] of this.buckets.entries()) {
      if (value <= upper) {
        current.buckets[i] += 1;
      }
    }
    current.count += 1;
    current.sum += value;
    this.series.set(key, current);
  }

  reset(): void {
    this.series.clear();
  }

  render(): string {
    const lines = [`# HELP ${this.name} ${this.help}`, `# TYPE ${this.name} histogram`];
    for (const s of this.series.values()) {
      for (const [i, upper] of this.buckets.entries()) {
        const bucketLabels = { ...s.labels, le: String(upper) };
        lines.push(`${this.name}_bucket${formatLabels(bucketLabels)} ${s.buckets[i]}`);
      }
      const infLabels = { ...s.labels, le: '+Inf' };
      lines.push(`${this.name}_bucket${formatLabels(infLabels)} ${s.count}`);
      lines.push(`${this.name}_sum${formatLabels(s.labels)} ${s.sum}`);
      lines.push(`${this.name}_count${formatLabels(s.labels)} ${s.count}`);
    }
    return lines.join('\n');
  }
}

export class Gauge {
  private readonly series = new Map<string, CounterSeries>();

  constructor(
    readonly name: string,
    readonly help: string
  ) {}

  set(labels: MetricLabels | undefined, value: number): void {
    this.series.set(seriesKey(this.name, labels), { labels: labels ?? {}, value });
  }

  reset(): void {
    this.series.clear();
  }

  render(): string {
    const lines = [`# HELP ${this.name} ${this.help}`, `# TYPE ${this.name} gauge`];
    for (const s of this.series.values()) {
      lines.push(`${this.name}${formatLabels(s.labels)} ${s.value}`);
    }
    return lines.join('\n');
  }
}

export const httpRequestsTotal = new Counter(
  'dialog_survey_http_requests_total',
  'Total HTTP requests handled.'
);

export const httpRequestDurationMs = new Histogram(
  'dialog_survey_http_request_duration_ms',
  'HTTP request duration in milliseconds.'
);

export const processInfo = new Gauge(
  'dialog_survey_process_info',
  'Process metadata (always 1). Labeled with node version and pid.'
);

export const processUptimeSeconds = new Gauge(
  'dialog_survey_process_uptime_seconds',
  'Process uptime in seconds.'
);

export const processMemoryBytes = new Gauge(
  'dialog_survey_process_memory_bytes',
  'Process memory usage in bytes (heap_used / rss).'
);

export function renderPrometheus(): string {
  processUptimeSeconds.set(undefined, process.uptime());
  const mem = process.memoryUsage();
  processMemoryBytes.set({ kind: 'heap_used' }, mem.heapUsed);
  processMemoryBytes.set({ kind: 'rss' }, mem.rss);
  processInfo.set({ node: process.version, pid: String(process.pid) }, 1);

  const sections = [
    processInfo.render(),
    processUptimeSeconds.render(),
    processMemoryBytes.render(),
    httpRequestsTotal.render(),
    httpRequestDurationMs.render(),
  ];
  return `${sections.join('\n\n')}\n`;
}

export function resetMetricsForTest(): void {
  httpRequestsTotal.reset();
  httpRequestDurationMs.reset();
  processInfo.reset();
  processUptimeSeconds.reset();
  processMemoryBytes.reset();
}
