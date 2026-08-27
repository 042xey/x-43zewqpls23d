import { createHash, timingSafeEqual } from "node:crypto";

const startedAt = Date.now();
let requests = 0;
let errors = 0;
let totalDurationMs = 0;

export function recordHttpRequest(statusCode: number, durationMs: number): void {
  requests += 1;
  totalDurationMs += durationMs;
  if (statusCode >= 500) errors += 1;
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
    http_requests_total: requests,
    http_errors_total: errors,
    http_request_duration_ms_total: totalDurationMs,
    http_request_duration_ms_average: requests === 0 ? 0 : totalDurationMs / requests,
  };
}
