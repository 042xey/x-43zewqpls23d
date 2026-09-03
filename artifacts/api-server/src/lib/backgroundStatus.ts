import { recordFailure, setMetric } from "./metrics";

export type BackgroundOperationState = "healthy" | "degraded" | "failed" | "stopped";

export interface BackgroundOperationStatus {
  state: BackgroundOperationState;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  lastError: string | null;
}

const operations = new Map<string, BackgroundOperationStatus>();

function updateMetrics(): void {
  let degraded = 0;
  let failed = 0;
  for (const operation of operations.values()) {
    if (operation.state === "degraded") degraded++;
    if (operation.state === "failed") failed++;
  }
  setMetric("background_operations_degraded", degraded);
  setMetric("background_operations_failed", failed);
}

function ensure(name: string): BackgroundOperationStatus {
  const existing = operations.get(name);
  if (existing) return existing;
  const status: BackgroundOperationStatus = {
    state: "healthy",
    lastSuccessAt: null,
    lastFailureAt: null,
    lastError: null,
  };
  operations.set(name, status);
  return status;
}

export function markBackgroundSuccess(name: string): void {
  const status = ensure(name);
  status.state = "healthy";
  status.lastSuccessAt = new Date().toISOString();
  status.lastError = null;
  updateMetrics();
}

export function markBackgroundFailure(name: string, error: unknown, permanent = false): void {
  const status = ensure(name);
  status.state = permanent ? "failed" : "degraded";
  status.lastFailureAt = new Date().toISOString();
  status.lastError = error instanceof Error ? error.message.slice(0, 256) : String(error).slice(0, 256);
  recordFailure("background_operation_failures_total", { operation: name, state: status.state });
  updateMetrics();
}

export function markBackgroundStopped(name: string): void {
  ensure(name).state = "stopped";
  updateMetrics();
}

export function getBackgroundStatus(): Record<string, BackgroundOperationStatus> {
  return Object.fromEntries(
    [...operations.entries()].map(([name, status]) => [name, { ...status }]),
  );
}
