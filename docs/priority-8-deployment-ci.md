# Priority 8 Deployment and CI

CI runs the canonical root commands `pnpm run typecheck` and `pnpm run build`,
then explicitly checks the production frontend, admin UI, API, admin server,
and release scripts. It builds both production Dockerfiles, scans them with
Trivy for HIGH and CRITICAL vulnerabilities, starts each image, and waits for
`/api/readyz` to return HTTP 200.

Dependabot monitors workspace dependencies and both Dockerfiles for base-image
and dependency updates. The cloudflared build stage is pinned to version
`2025.8.1` and the multi-architecture manifest digest
`sha256:b77d84e8704db38db22c22661cf7e56468c526e3a6a5fe9c8b7c151452fa1472`.
Update the version and digest together after reviewing the upstream release.

The staging smoke workflow runs automatically after a successful staging
deployment and can also be dispatched manually. It checks API liveness and
readiness plus admin-server liveness using the `STAGING_API_URL` and
`STAGING_ADMIN_URL` repository variables.
