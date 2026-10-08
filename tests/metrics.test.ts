import { describe, expect, it } from 'vitest';
import { Counter, Gauge, Histogram, renderPrometheus } from '../src/utils/metrics.js';

describe('Counter', () => {
  it('should accumulate values per label series', () => {
    const c = new Counter('test_total', 'test counter');
    c.inc({ method: 'GET' });
    c.inc({ method: 'GET' });
    c.inc({ method: 'POST' }, 3);

    const rendered = c.render();
    expect(rendered).toContain('# TYPE test_total counter');
    expect(rendered).toContain('test_total{method="GET"} 2');
    expect(rendered).toContain('test_total{method="POST"} 3');
  });

  it('should escape special characters in label values', () => {
    const c = new Counter('esc_total', 'escaping');
    c.inc({ route: '/a"b\\c\nd' });

    expect(c.render()).toContain('route="/a\\"b\\\\c\\nd"');
  });

  it('should render without labels when none provided', () => {
    const c = new Counter('plain_total', 'plain');
    c.inc();

    expect(c.render()).toContain('plain_total 1');
  });

  it('should not merge series whose values contain the key separators', () => {
    const c = new Counter('collide_total', 'collision');
    c.inc({ a: 'b|c', d: 'e' }, 1);
    c.inc({ a: 'b', 'c|d': 'e' }, 1);

    const rendered = c.render();
    expect(rendered).toContain('collide_total{a="b|c",d="e"} 1');
    expect(rendered).toContain('collide_total{a="b",c|d="e"} 1');
  });
});

describe('Histogram', () => {
  it('should render cumulative buckets, sum and count', () => {
    const h = new Histogram('dur_ms', 'duration', [10, 100]);
    h.observe(undefined, 5);
    h.observe(undefined, 50);
    h.observe(undefined, 500);

    const rendered = h.render();
    expect(rendered).toContain('dur_ms_bucket{le="10"} 1');
    expect(rendered).toContain('dur_ms_bucket{le="100"} 2');
    expect(rendered).toContain('dur_ms_bucket{le="+Inf"} 3');
    expect(rendered).toContain('dur_ms_sum 555');
    expect(rendered).toContain('dur_ms_count 3');
  });

  it('should merge observations sharing identical labels', () => {
    const h = new Histogram('dur_ms', 'duration', [10]);
    h.observe({ route: '/a' }, 1);
    h.observe({ route: '/a' }, 20);

    expect(h.render()).toContain('dur_ms_bucket{le="10",route="/a"} 1');
    expect(h.render()).toContain('dur_ms_count{route="/a"} 2');
  });

  it('should count a value exactly at the bucket upper bound into that bucket', () => {
    const h = new Histogram('dur_ms', 'duration', [10, 100]);
    h.observe(undefined, 10);
    h.observe(undefined, 100);

    expect(h.render()).toContain('dur_ms_bucket{le="10"} 1');
    expect(h.render()).toContain('dur_ms_bucket{le="100"} 2');
  });
});

describe('Gauge', () => {
  it('should keep only the latest value per series', () => {
    const g = new Gauge('up_gauge', 'uptime');
    g.set(undefined, 1);
    g.set(undefined, 42);

    expect(g.render()).toContain('up_gauge 42');
    expect(g.render()).not.toContain('up_gauge 1');
  });
});

describe('renderPrometheus', () => {
  it('should end with a newline and include process gauges', () => {
    const rendered = renderPrometheus();
    expect(rendered.endsWith('\n')).toBe(true);
    expect(rendered).toContain('dialog_survey_process_uptime_seconds');
    expect(rendered).toContain('dialog_survey_process_memory_bytes{kind="heap_used"}');
    expect(rendered).toContain('dialog_survey_process_memory_bytes{kind="rss"}');
  });
});
