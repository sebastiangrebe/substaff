---
title: Local Development
summary: Set up Substaff for local development
---

Run Substaff locally with zero external dependencies.

## Prerequisites

- Node.js 20+
- pnpm 9+

## Start Dev Server

```sh
pnpm install
pnpm dev
```

This starts:

- **API server** at `http://localhost:3100`
- **UI** served by the API server in dev middleware mode (same origin)

No Docker or external database required. Substaff uses embedded PostgreSQL automatically.

## One-Command Bootstrap

For a first-time install:

```sh
pnpm substaff run
```

This does:

1. Auto-onboards if config is missing
2. Runs `substaff doctor` with repair enabled
3. Starts the server when checks pass

## Tailscale/Private Auth Dev Mode

To run in `authenticated/private` mode for network access:

```sh
pnpm dev --tailscale-auth
```

This binds the server to `0.0.0.0` for private-network access.

Allow additional private hostnames:

```sh
pnpm substaff allowed-hostname dotta-macbook-pro
```

## Health Checks

```sh
curl http://localhost:3100/api/health
# -> {"status":"ok"}

curl http://localhost:3100/api/companies
# -> []
```

## Reset Dev Data

To wipe local data and start fresh:

```sh
rm -rf ~/.substaff/instances/default/db
pnpm dev
```

## Data Locations

| Data | Path |
|------|------|
| Config | `~/.substaff/instances/default/config.json` |
| Database | `~/.substaff/instances/default/db` |
| Storage | `~/.substaff/instances/default/data/storage` |
| Secrets key | `~/.substaff/instances/default/secrets/master.key` |
| Logs | `~/.substaff/instances/default/logs` |

Override with environment variables:

```sh
SUBSTAFF_HOME=/custom/path SUBSTAFF_INSTANCE_ID=dev pnpm substaff run
```
