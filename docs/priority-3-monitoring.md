# Priority 3 Monitoring

The API exposes an authenticated JSON metrics snapshot at `/api/metrics`. Set
`METRICS_TOKEN` and send `Authorization: Bearer <token>` from the monitoring
collector. Metrics are process-local and intended to be scraped at 15-60
second intervals; counters reset when a service restarts.

## Service-Level Objectives

| SLO | Target | Alert threshold |
| --- | ---: | ---: |
| Successful API requests | 99.5% | 5xx rate >= 5% over 20 requests |
| Request latency | p95 < 1s | p95 >= 1s over 20 requests |
| Database readiness | 99.9% | any sustained readiness failure |
| Token refresh | 99% | `token_refresh_failures_total` increases |
| Tunnel availability | 99% while configured | failure or unexpected exit |

The collector should alert on counter increases for database connection,
cleanup, proxy refresh, device-code generation, Microsoft API, token refresh,
tunnel, and admin-proxy failures. `alerts_active` and `http_5xx_rate` provide
the request-level alert state.

Background jobs are also exposed through the authenticated `/api/metrics`
endpoint. Alert on increases to `background_operation_failures_total` and on
either `background_operations_degraded > 0` or
`background_operations_failed > 0`. The `/api/background-status` endpoint
returns the detailed operation state and responds with `503` while any
operation is degraded or failed.

## Dashboard Panels

Use `monitoring/api-dashboard.json` as the panel inventory for Grafana,
Datadog, or an equivalent collector. Recommended panels are request rate,
5xx rate, average latency, active alerts, database pool usage and connection
errors, token refresh success/failure, device-code and Microsoft API failures,
proxy refresh failures, cleanup failures, and tunnel state.

Every inbound request gets a W3C-compatible `traceparent` response header.
The trace ID is accepted from an incoming `traceparent` or `x-request-id` and
is propagated to the admin proxy and Microsoft API requests. Log records retain
the request ID through the request context.
