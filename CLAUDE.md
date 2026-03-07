# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What is Substaff

Substaff is a multi-tenant SaaS platform for autonomous AI agent teams. It provides org charts, budgets, governance, goal alignment, and agent coordination — turning individual AI agents into structured companies. Built on Node.js with vendor-level multi-tenancy, managed execution sandboxes, and token-metered billing.

## Commands

```sh
pnpm install              # Install all dependencies
pnpm dev                  # Full dev (API + UI on localhost:3100)
pnpm dev:server           # Server only
pnpm build                # Build all packages
pnpm typecheck            # Type check all packages (pnpm -r typecheck)
pnpm test:run             # Run all tests (vitest)
pnpm test -- --run <path> # Run a single test file
pnpm db:generate          # Generate DB migration (edit schema first)
pnpm db:migrate           # Apply migrations
pnpm substaff          # CLI tool access
```

## Architecture

Monorepo managed with pnpm workspaces. All packages use TypeScript (ES2023, NodeNext modules).

### Workspace packages

- **`server/`** — Express REST API server. Entry: `server/src/index.ts`. Routes in `server/src/routes/`, services in `server/src/services/`. The heartbeat service (`server/src/services/heartbeat.ts`) is the core orchestration engine that schedules agent wakeups and processes task assignments.
- **`ui/`** — React 19 + Vite + React Router SPA. Entry: `ui/src/main.tsx`. Uses Radix UI + Tailwind CSS. State via TanStack Query. Real-time updates via WebSocket (`LiveUpdatesProvider`). Pages in `ui/src/pages/`, components in `ui/src/components/`, API clients in `ui/src/api/`.
- **`packages/db/`** — Drizzle ORM schema and migrations. Schema files in `packages/db/src/schema/`. New tables must be exported from `packages/db/src/schema/index.ts`. Migration generation reads compiled JS from `dist/`, so `pnpm db:generate` compiles first.
- **`packages/shared/`** — Shared types, constants, validators, API path constants used by server and UI.
- **`packages/adapters/`** — Agent runtime adapters (E2B sandbox). Each exports default, `/server`, `/ui`, `/cli` entry points.
- **`packages/adapter-utils/`** — Shared utilities for agent adapters.
- **`packages/storage/`** — Object storage abstraction (S3/R2) for project files and artifacts.
- **`cli/`** — Commander.js CLI for setup (`onboard`, `doctor`, `configure`), operations (`run`, `heartbeat-run`), and client commands (`issue`, `agent`, `company`, `dashboard`).
- **`skills/`** — Skill packages that agents can use at runtime (substaff heartbeat skill, agent adapter creation, etc.).

### Database

- Requires PostgreSQL 16+ via `DATABASE_URL` (no embedded PGlite — SaaS requires managed Postgres).
- Uses Row-Level Security (RLS) for vendor/company tenant isolation.
- Vendor -> Company -> Agent/Issue/Project hierarchy for multi-tenancy.

### Database change workflow

1. Edit schema in `packages/db/src/schema/*.ts`
2. Export new tables from `packages/db/src/schema/index.ts`
3. `pnpm db:generate`
4. `pnpm -r typecheck`

### API

- Base path: `/api`
- Vendor owners have full-control access. Agent access uses bearer API keys (hashed at rest).
- Every domain entity is vendor+company-scoped. All routes enforce tenant boundaries via RLS.

## Key Invariants

- Single-assignee task model
- Atomic issue checkout semantics
- Approval gates for governed actions
- Budget hard-stop auto-pause behavior
- Activity logging for all mutations

## Cross-layer contract sync

When changing schema or API behavior, update all impacted layers together:
`packages/db` schema -> `packages/shared` types/constants -> `server` routes/services -> `ui` API clients and pages

## Verification

Run before claiming work is done:
```sh
pnpm -r typecheck
pnpm test:run
pnpm build
```

## Reference docs

- `doc/DEVELOPING.md` — Full development guide
- `doc/DATABASE.md` — Database configuration
- `doc/CLI.md` — CLI command reference
- `doc/DEPLOYMENT-MODES.md` — Deployment modes
- `doc/SPEC-implementation.md` — V1 build contract
- `doc/GOAL.md` and `doc/PRODUCT.md` — Product context
