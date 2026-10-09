/**
 * Minimal ambient type declaration for autocannon v8 (no official types ship
 * with the package and @types/autocannon targets v7). Only the surface used
 * by the loadtest harness is declared; the v8 histogram has p97_5 but no p95
 * bucket, which is why the runner interpolates p95 between adjacent buckets.
 */
declare module 'autocannon' {
  interface AutocannonLatency {
    average: number;
    mean: number;
    stddev: number;
    min: number;
    max: number;
    p0_001: number;
    p0_01: number;
    p0_1: number;
    p1: number;
    p2_5: number;
    p10: number;
    p25: number;
    p50: number;
    p75: number;
    p90: number;
    p97_5: number;
    p99: number;
    p99_9: number;
    p99_99: number;
    p99_999: number;
    totalCount: number;
  }

  interface AutocannonRequests {
    average: number;
    mean: number;
    stddev: number;
    min: number;
    max: number;
    total: number;
    sent: number;
  }

  interface AutocannonResult {
    title?: string;
    url: string;
    connections: number;
    duration: number;
    start: Date;
    finish: Date;
    errors: number;
    timeouts: number;
    mismatches: number;
    non2xx: number;
    resets: number;
    '1xx': number;
    '2xx': number;
    '3xx': number;
    '4xx': number;
    '5xx': number;
    requests: AutocannonRequests;
    latency: AutocannonLatency;
  }

  interface AutocannonOptions {
    url: string;
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    connections?: number;
    duration?: number;
    pipelining?: number;
    workers?: number;
  }

  function autocannon(
    opts: AutocannonOptions,
    cb: (err: Error | null, result: AutocannonResult) => void
  ): unknown;

  export default autocannon;
  export type { AutocannonLatency, AutocannonRequests, AutocannonResult, AutocannonOptions };
}
