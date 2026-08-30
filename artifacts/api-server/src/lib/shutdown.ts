const controller = new AbortController();

export function shutdownSignal(): AbortSignal {
  return controller.signal;
}

export function abortOutboundRequests(): void {
  if (!controller.signal.aborted) controller.abort(new Error("Server shutting down"));
}
