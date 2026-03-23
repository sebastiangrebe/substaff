FROM node:20-bookworm-slim AS base
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl git \
  && rm -rf /var/lib/apt/lists/*
RUN corepack enable

FROM base AS deps
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc ./
COPY cli/package.json cli/
COPY server/package.json server/
COPY ui/package.json ui/
COPY packages/shared/package.json packages/shared/
COPY packages/db/package.json packages/db/
COPY packages/adapter-utils/package.json packages/adapter-utils/
COPY packages/adapters/claude-local/package.json packages/adapters/claude-local/
COPY packages/adapters/codex-local/package.json packages/adapters/codex-local/
COPY packages/adapters/cursor-local/package.json packages/adapters/cursor-local/
COPY packages/adapters/e2b-sandbox/package.json packages/adapters/e2b-sandbox/
COPY packages/adapters/blaxel-sandbox/package.json packages/adapters/blaxel-sandbox/
COPY packages/adapters/openclaw/package.json packages/adapters/openclaw/
COPY packages/adapters/opencode-local/package.json packages/adapters/opencode-local/
COPY packages/storage/package.json packages/storage/
COPY packages/app-core/package.json packages/app-core/
RUN pnpm install --frozen-lockfile

FROM base AS build
WORKDIR /app
COPY --from=deps /app /app
COPY . .
RUN pnpm --filter @substaff/shared build
RUN pnpm --filter @substaff/app-core build
RUN pnpm --filter @substaff/ui build
RUN pnpm --filter @substaff/server build

FROM base AS production
WORKDIR /app
COPY --from=build /app /app

ENV NODE_ENV=production \
  HOME=/substaff \
  HOST=0.0.0.0 \
  PORT=3100 \
  SERVE_UI=true \
  SUBSTAFF_HOME=/substaff \
  SUBSTAFF_INSTANCE_ID=default \
  SUBSTAFF_CONFIG=/substaff/instances/default/config.json \
  SUBSTAFF_DEPLOYMENT_MODE=authenticated \
  SUBSTAFF_MIGRATION_AUTO_APPLY=true

EXPOSE 3100

CMD ["node", "--import", "./server/node_modules/tsx/dist/loader.mjs", "server/dist/index.js"]
