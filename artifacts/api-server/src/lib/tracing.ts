import { AsyncLocalStorage } from "node:async_hooks";
import { randomBytes } from "node:crypto";

const context = new AsyncLocalStorage<string>();

export function newTraceId(): string {
  return randomBytes(16).toString("hex");
}

export function runWithTrace<T>(traceId: string, fn: () => T): T {
  return context.run(traceId, fn);
}

export function currentTraceId(): string | undefined { return context.getStore(); }

export function traceHeaders(): Record<string, string> {
  const traceId = currentTraceId();
  return traceId ? { "x-request-id": traceId, traceparent: `00-${traceId}-0000000000000001-01` } : {};
}
