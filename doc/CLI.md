# CLI Reference

Substaff CLI now supports both:

- instance setup/diagnostics (`onboard`, `doctor`, `configure`, `env`, `allowed-hostname`)
- control-plane client operations (issues, approvals, agents, activity, dashboard)

## Base Usage

Use repo script in development:

```sh
pnpm substaff --help
```

First-time local bootstrap + run:

```sh
pnpm substaff run
```

Choose local instance:

```sh
pnpm substaff run --instance dev
```

## Deployment Modes

Mode taxonomy and design intent are documented in `doc/DEPLOYMENT-MODES.md`.

Current CLI behavior:

- `substaff onboard` and `substaff configure --section server` set deployment mode in config
- runtime can override mode with `SUBSTAFF_DEPLOYMENT_MODE`
- `substaff run` and `substaff doctor` do not yet expose a direct `--mode` flag

Target behavior (planned) is documented in `doc/DEPLOYMENT-MODES.md` section 5.

Allow an authenticated/private hostname (for example custom Tailscale DNS):

```sh
pnpm substaff allowed-hostname dotta-macbook-pro
```

All client commands support:

- `--data-dir <path>`
- `--api-base <url>`
- `--api-key <token>`
- `--context <path>`
- `--profile <name>`
- `--json`

Company-scoped commands also support `--company-id <id>`.

Use `--data-dir` on any CLI command to isolate all default local state (config/context/db/logs/storage/secrets) away from `~/.substaff`:

```sh
pnpm substaff run --data-dir ./tmp/substaff-dev
pnpm substaff issue list --data-dir ./tmp/substaff-dev
```

## Context Profiles

Store local defaults in `~/.substaff/context.json`:

```sh
pnpm substaff context set --api-base http://localhost:3100 --company-id <company-id>
pnpm substaff context show
pnpm substaff context list
pnpm substaff context use default
```

To avoid storing secrets in context, set `apiKeyEnvVarName` and keep the key in env:

```sh
pnpm substaff context set --api-key-env-var-name SUBSTAFF_API_KEY
export SUBSTAFF_API_KEY=...
```

## Company Commands

```sh
pnpm substaff company list
pnpm substaff company get <company-id>
pnpm substaff company delete <company-id-or-prefix> --yes --confirm <same-id-or-prefix>
```

Examples:

```sh
pnpm substaff company delete PAP --yes --confirm PAP
pnpm substaff company delete 5cbe79ee-acb3-4597-896e-7662742593cd --yes --confirm 5cbe79ee-acb3-4597-896e-7662742593cd
```

Notes:

- Deletion is server-gated by `SUBSTAFF_ENABLE_COMPANY_DELETION`.
- With agent authentication, company deletion is company-scoped. Use the current company ID/prefix (for example via `--company-id` or `SUBSTAFF_COMPANY_ID`), not another company.

## Issue Commands

```sh
pnpm substaff issue list --company-id <company-id> [--status todo,in_progress] [--assignee-agent-id <agent-id>] [--match text]
pnpm substaff issue get <issue-id-or-identifier>
pnpm substaff issue create --company-id <company-id> --title "..." [--description "..."] [--status todo] [--priority high]
pnpm substaff issue update <issue-id> [--status in_progress] [--comment "..."]
pnpm substaff issue comment <issue-id> --body "..." [--reopen]
pnpm substaff issue checkout <issue-id> --agent-id <agent-id> [--expected-statuses todo,backlog,blocked]
pnpm substaff issue release <issue-id>
```

## Agent Commands

```sh
pnpm substaff agent list --company-id <company-id>
pnpm substaff agent get <agent-id>
```

## Approval Commands

```sh
pnpm substaff approval list --company-id <company-id> [--status pending]
pnpm substaff approval get <approval-id>
pnpm substaff approval create --company-id <company-id> --type hire_agent --payload '{"name":"..."}' [--issue-ids <id1,id2>]
pnpm substaff approval approve <approval-id> [--decision-note "..."]
pnpm substaff approval reject <approval-id> [--decision-note "..."]
pnpm substaff approval request-revision <approval-id> [--decision-note "..."]
pnpm substaff approval resubmit <approval-id> [--payload '{"...":"..."}']
pnpm substaff approval comment <approval-id> --body "..."
```

## Activity Commands

```sh
pnpm substaff activity list --company-id <company-id> [--agent-id <agent-id>] [--entity-type issue] [--entity-id <id>]
```

## Dashboard Commands

```sh
pnpm substaff dashboard get --company-id <company-id>
```

## Heartbeat Command

`heartbeat run` now also supports context/api-key options and uses the shared client stack:

```sh
pnpm substaff heartbeat run --agent-id <agent-id> [--api-base http://localhost:3100] [--api-key <token>]
```

## Local Storage Defaults

Default local instance root is `~/.substaff/instances/default`:

- config: `~/.substaff/instances/default/config.json`
- embedded db: `~/.substaff/instances/default/db`
- logs: `~/.substaff/instances/default/logs`
- storage: `~/.substaff/instances/default/data/storage`
- secrets key: `~/.substaff/instances/default/secrets/master.key`

Override base home or instance with env vars:

```sh
SUBSTAFF_HOME=/custom/home SUBSTAFF_INSTANCE_ID=dev pnpm substaff run
```

## Storage Configuration

Configure storage provider and settings:

```sh
pnpm substaff configure --section storage
```

Supported providers:

- `local_disk` (default; local single-user installs)
- `s3` (S3-compatible object storage)
