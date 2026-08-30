import { createHash, timingSafeEqual } from "node:crypto";
import { logger } from "./logger";

const startedAt = Date.now();
const counters = new Map<string, number>();
const gauges = new Map<string, number>();
const latency = { count: 0, totalMs: 0, slow: 0 };
const latencySamples: number[] = [];
const alertState = new Map<string, boolean>();

function increment(name: string, value = 1): void {
  counters.set(name, (counters.get(name) ?? 0) + value);
}

export function recordHttpRequest(statusCode: number, durationMs: number): void {
  increment("http_requests_total");
  increment(`http_requests_total{status_class="${Math.floor(statusCode / 100)}xx"}`);
  latency.count += 1;
  latency.totalMs += durationMs;
  latencySamples.push(durationMs);
  if (latencySamples.length > 1000) latencySamples.shift();
  if (statusCode >= 500) increment("http_errors_total");
  if (durationMs >= 1000) latency.slow += 1;
  evaluateAlerts();
}

export function recordMetric(name: string, value = 1): void { increment(name, value); }
export function setMetric(name: string, value: number): void { gauges.set(name, value); }

export function recordFailure(name: string, labels?: Record<string, string>): void {
  increment(name);
  if (labels) {
    const suffix = Object.entries(labels).map(([k, v]) => `${k}="${v.replaceAll('"', "'")}"`).join(",");
    increment(`${name}{${suffix}}`);
  }
  logger.warn({ alert: `${name}_alert` }, "Monitoring failure alert fired");
}

export function updateDatabasePoolMetrics(pool: { totalCount: number; idleCount: number; waitingCount: number }): void {
  setMetric("db_pool_connections_total", pool.totalCount);
  setMetric("db_pool_connections_idle", pool.idleCount);
  setMetric("db_pool_waiting_requests", pool.waitingCount);
}

function evaluateAlerts(): void {
  const total = counters.get("http_requests_total") ?? 0;
  const errors = counters.get("http_errors_total") ?? 0;
  const errorRate = total ? errors / total : 0;
  const average = latency.count ? latency.totalMs / latency.count : 0;
  const sorted = [...latencySamples].sort((a, b) => a - b);
  const p95 = sorted.length ? sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)]! : 0;
  setMetric("http_5xx_rate", errorRate);
  setMetric("http_request_latency_average_ms", average);
  setMetric("http_request_latency_p95_ms", p95);
  alert("http_5xx_rate_high", errorRate >= 0.05 && total >= 20, { rate: errorRate });
  alert("http_latency_high", p95 >= 1000 && total >= 20, { p95Ms: p95 });
}

function alert(name: string, active: boolean, details: Record<string, number>): void {
  if (alertState.get(name) === active) return;
  alertState.set(name, active);
  logger[active ? "error" : "info"]({ alert: name, active, ...details }, active ? "Monitoring alert fired" : "Monitoring alert cleared");
}

export function isMetricsAuthorized(provided: string | undefined): boolean {
  const expected = process.env["METRICS_TOKEN"]?.trim();
  if (!expected || !provided) return false;
  const actualDigest = createHash("sha256").update(provided).digest();
  const expectedDigest = createHash("sha256").update(expected).digest();
  return timingSafeEqual(actualDigest, expectedDigest);
}

export function getMetrics(): Record<string, number> {
  return {
    uptime_seconds: Math.floor((Date.now() - startedAt) / 1000),
    ...Object.fromEntries(counters),
    ...Object.fromEntries(gauges),
    http_request_duration_ms_total: latency.totalMs,
    http_request_duration_ms_average: latency.count === 0 ? 0 : latency.totalMs / latency.count,
    http_slow_requests_total: latency.slow,
    alerts_active: [...alertState.values()].filter(Boolean).length,
  };
}
