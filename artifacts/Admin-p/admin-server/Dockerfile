# syntax=docker/dockerfile:1
#
# Builds and serves the "admin" pair: @workspace/admin-server (Express API)
# plus @workspace/admin-ui (Vite SPA), which admin-server serves as static
# files at runtime under /admin-panel (see src/app.ts). Both must be built
# from this single image because admin-server resolves the admin-ui build
# output via a relative path (../../admin-ui/dist/public) at runtime.
#
# Build context MUST be the repository root (not this directory), because
# this is a pnpm workspace: installing from the root is required for
# workspace:* links (e.g. @workspace/db) to resolve.
#
# Railway service settings:
#   Root Directory:        / (repo root)
#   RAILWAY_DOCKERFILE_PATH: artifacts/Admin-p/admin-server/Dockerfile
#
# Required runtime environment variables:
#   DATABASE_URL       - shared Postgres connection string (same Railway
#                        Postgres plugin used by the api-server service)
#   PORT               - injected automatically by Railway
#   ADMIN_ROUTE_PREFIX - path segment the admin API is mounted under (required)
#   ADMIN_BOOTSTRAP_TOKEN - one-time secret required to create the first account
#   ADMIN_UI_ORIGIN    - comma-separated exact browser origins allowed for
#                        cross-origin admin calls
#   METRICS_TOKEN      - bearer token required to access /api/metrics (optional)
#
# The server refuses to start when no admin account exists unless
# ADMIN_BOOTSTRAP_TOKEN is provided.

FROM node:26-slim AS base
WORKDIR /repo
RUN corepack enable

# ---- deps: install once, shared by build stages -----------------------------
FROM base AS deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc ./
COPY tsconfig.json tsconfig.base.json ./
COPY lib ./lib
COPY artifacts/Admin-p/admin-server ./artifacts/Admin-p/admin-server
COPY artifacts/Admin-p/admin-ui ./artifacts/Admin-p/admin-ui
RUN pnpm install --frozen-lockfile

# ---- build: compile lib deps, then build both packages ----------------------
FROM deps AS build
RUN pnpm run typecheck:libs
RUN pnpm --filter @workspace/admin-ui run build
RUN pnpm --filter @workspace/admin-server run build

# ---- runtime: minimal image with only the built output -----------------------
FROM node:26-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

# Preserve the same relative layout admin-server expects on disk:
#   app/artifacts/Admin-p/admin-server/dist/index.mjs
#   app/artifacts/Admin-p/admin-ui/dist/public/...
COPY --from=build --chown=node:node /repo/artifacts/Admin-p/admin-server/dist ./artifacts/Admin-p/admin-server/dist
COPY --from=build --chown=node:node /repo/artifacts/Admin-p/admin-ui/dist/public ./artifacts/Admin-p/admin-ui/dist/public
COPY --from=build --chown=node:node /repo/lib/db/migrations ./lib/db/migrations

WORKDIR /app/artifacts/Admin-p/admin-server
USER node
EXPOSE 8099
CMD ["node", "--enable-source-maps", "dist/index.mjs"]
