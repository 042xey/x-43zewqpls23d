# Priority 7 Token and Secret Lifecycle

## Encryption-key rotation

Keep the current key in `CONFIG_ENCRYPTION_KEY` and place the replacement in a
separate protected release secret. Run the one-shot rotation job while the old
key is still active:

```sh
OLD_CONFIG_ENCRYPTION_KEY='old-key-at-least-32-chars' \
CONFIG_ENCRYPTION_KEY='new-key-at-least-32-chars' \
pnpm --filter @workspace/scripts run rotate-secrets
```

The job reads encrypted configuration, access tokens, refresh tokens, and proxy
URLs using the old key and rewrites every value with the new key in one database
transaction. Stop writers or use a maintenance window during the rotation, then
restart both services with only the new key. Take and verify a backup first.

## Worker secret rotation

Deploy a new Worker containing the new `WORKER_API_SECRET` while the API accepts
both values: set `WORKER_API_SECRET` to the new value and
`WORKER_API_SECRET_PREVIOUS` to the old value. After the new Worker is confirmed
live on every route, remove `WORKER_API_SECRET_PREVIOUS` and redeploy the API.
The overlap prevents downtime and the old value is never written to logs or
responses.

## Bootstrap token

Production requires `ADMIN_BOOTSTRAP_TOKEN_EXPIRES_AT` whenever
`ADMIN_BOOTSTRAP_TOKEN` is configured. Use a short-lived UTC timestamp, perform
first-run setup, then remove both bootstrap variables from the service. Expired
bootstrap tokens are rejected. The setup route also removes the legacy persisted
admin key after successful bootstrap; stale bootstrap environment values must be
cleaned up by the deployment secret manager.

## Exposure controls

Access and refresh token values are encrypted at rest and are never included in
logs, error payloads, metrics, traces, or frontend state. Token listing and
refresh responses expose metadata only and use `[redacted]` for access-token
fields. Proxy credentials are encrypted at rest and are stripped from admin
responses and logs.

## Audit events

Administrative actions are recorded in `audit_events` without secret values,
including token reveal/refresh, deletion, invalidation, bootstrap, login,
logout, proxy changes, tunnel changes, and Cloudflare configuration changes.
Audit persistence failures are logged as operational errors and do not expose
request bodies or credentials.
