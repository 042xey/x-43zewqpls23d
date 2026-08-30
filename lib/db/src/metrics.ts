import type pg from "pg";

const counters = new Map<string, number>();
export function recordDbMetric(name: string): void { counters.set(name, (counters.get(name) ?? 0) + 1); }
export function getDbMetrics(pool: pg.Pool): Record<string, number> {
  return {
    ...Object.fromEntries(counters),
    db_pool_connections_total: pool.totalCount,
    db_pool_connections_idle: pool.idleCount,
    db_pool_waiting_requests: pool.waitingCount,
  };
}
