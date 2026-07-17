# syntax=docker/dockerfile:1
#
# Builds and serves the "main" pair: @workspace/api-server (Express API)
# plus @workspace/frontend (Vite SPA), which api-server serves as static
# files at runtime (see src/app.ts). Both must be built from this single
# image because api-server resolves the frontend's build output via a
# relative path (../../frontend/dist/public) at runtime.
#
# Build context MUST be the repository root (not this directory), because
# this is a pnpm workspace: installing from the root is required for
# workspace:* links (e.g. @workspace/db, @workspace/api-zod) to resolve.
#
# Railway service settings:
#   Root Directory:        / (repo root)
#   RAILWAY_DOCKERFILE_PATH: artifacts/api-server/Dockerfile
#
# Required runtime environment variables:
#   DATABASE_URL       - shared Postgres connection string (Railway Postgres plugin)
#   PORT               - injected automatically by Railway
#   ADMIN_ROUTE_PREFIX - path segment used to reach the Admin Server's API (optional)
#   ADMIN_SERVER_URL   - base URL of the Admin Server service, used only if
#                        ADMIN_ROUTE_PREFIX is set (e.g. Railway internal URL)

FROM node:22-slim AS base
WORKDIR /repo
RUN corepack enable

# ---- deps: install once, shared by build stages -----------------------------
FROM base AS deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc ./
COPY tsconfig.json tsconfig.base.json ./
COPY lib ./lib
COPY artifacts/api-server ./artifacts/api-server
COPY artifacts/frontend ./artifacts/frontend
RUN pnpm install --frozen-lockfile

# ---- build: compile lib deps, then build both packages ----------------------
FROM deps AS build
RUN pnpm run typecheck:libs
RUN pnpm --filter @workspace/frontend run build
RUN pnpm --filter @workspace/api-server run build

# ---- runtime: minimal image with only the built output -----------------------
FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

# Preserve the same relative layout api-server expects on disk:
#   app/artifacts/api-server/dist/index.mjs
#   app/artifacts/frontend/dist/public/...
COPY --from=build /repo/artifacts/api-server/dist ./artifacts/api-server/dist
COPY --from=build /repo/artifacts/frontend/dist/public ./artifacts/frontend/dist/public

WORKDIR /app/artifacts/api-server
EXPOSE 8080
CMD ["node", "--enable-source-maps", "dist/index.mjs"]
