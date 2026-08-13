# syntax=docker/dockerfile:1
# PaintingCMS API image (design D9) — multi-stage, non-root runtime.
#
# OWNER: backend engineer. This is the scaffold baseline; the contract to keep:
#   - `pnpm --filter @painting/api build` must emit apps/api/dist
#   - Drizzle migrations live in apps/api/drizzle (applied on container start)
#   - Runtime runs as non-root `node` (uid 1000) and serves dist/main.js
#   - photos volume is mounted at /app/storage/photos by podman-compose.yml

# ---- Stage 1: install workspace deps + build ----
FROM node:22-alpine AS build
WORKDIR /repo

# Bootstrap pnpm at the workspace version (host workflow is pnpm-only; npm is
# used here solely to install pnpm inside the image).
RUN npm install -g pnpm@10.33.0

# Manifests first for dependency-layer caching
COPY pnpm-workspace.yaml pnpm-lock.yaml .npmrc ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/

RUN pnpm install --frozen-lockfile

# Source (api + web + shared — web is built for the production SPA serving
# layer; see the runtime COPY below)
COPY apps/api apps/api
COPY apps/web apps/web
COPY packages/shared packages/shared

# shared MUST be built FIRST: api and web both resolve @painting/shared to its
# compiled dist (package.json main/types/exports → dist/), which is gitignored
# and therefore absent from the build context. Same order as the host
# `just build-shared` (dev/build recipe) — the Docker build must mirror it.
RUN pnpm --filter @painting/shared build
RUN pnpm --filter @painting/api build
RUN pnpm --filter @painting/web build

# ---- Stage 2: runtime (non-root) ----
FROM node:22-alpine AS runtime
WORKDIR /repo

# node:22-alpine already ships the `node` user (uid 1000, gid 1000) — that is
# the non-root runtime identity. No adduser/addgroup: creating a group with
# gid 1000 here fails on this image (addgroup: gid '1000' in use).
RUN npm install -g pnpm@10.33.0

# Materialize ONLY the api package with its prod deps (workspace: deps like
# @painting/shared are bundled by `pnpm deploy`). Then drop the build tree.
# --legacy: pnpm v10 refuses deploy from non-injected workspaces; legacy mode
# symlinks workspace deps into the deployed tree's own .pnpm store (still
# self-contained — the copy includes shared's freshly built dist), so
# rm -rf /repo is safe and dev semantics (no inject-workspace-packages) hold.
COPY --from=build /repo /repo
RUN pnpm --filter @painting/api deploy --legacy --prod /app \
    && rm -rf /repo

WORKDIR /app

# Compiled output + migrations
COPY --from=build /repo/apps/api/dist /app/dist
COPY --from=build /repo/apps/api/drizzle /app/drizzle

# Container-start migration runner (design D9: "runs drizzle migrations on
# start"). Uses drizzle-orm's own programmatic migrator — no drizzle-kit in
# the prod image. See apps/api/docker-migrate.cjs for rationale.
COPY --from=build /repo/apps/api/docker-migrate.cjs /app/migrate.cjs

# Built SPA — the API serves it in production (AppModule webAppServing():
# dist/main.js → __dirname = /app/dist → ../../web/dist = /web/dist in this
# image). Landing it at /web/dist makes existsSync() true so ServeStaticModule
# registers and Caddy's blanket reverse-proxy serves the Mini App.
COPY --from=build /repo/apps/web/dist /web/dist

# Photos volume mount point
RUN mkdir -p /app/storage/photos && chown -R node:node /app

USER node

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/health || exit 1

# Migrate, then start — exec replaces the shell so PID 1 is node (SIGTERM
# reaches the app for graceful shutdown, e.g. bot deleteWebhook).
CMD ["sh", "-c", "node migrate.cjs && exec node dist/main.js"]
