---
title: Setup Commands
summary: Onboard, run, doctor, and configure
---

Instance setup and diagnostics commands.

## `substaff run`

One-command bootstrap and start:

```sh
pnpm substaff run
```

Does:

1. Auto-onboards if config is missing
2. Runs `substaff doctor` with repair enabled
3. Starts the server when checks pass

Choose a specific instance:

```sh
pnpm substaff run --instance dev
```

## `substaff onboard`

Interactive first-time setup:

```sh
pnpm substaff onboard
```

First prompt:

1. `Quickstart` (recommended): local defaults (embedded database, no LLM provider, local disk storage, default secrets)
2. `Advanced setup`: full interactive configuration

Start immediately after onboarding:

```sh
pnpm substaff onboard --run
```

Non-interactive defaults + immediate start (opens browser on server listen):

```sh
pnpm substaff onboard --yes
```

## `substaff doctor`

Health checks with optional auto-repair:

```sh
pnpm substaff doctor
pnpm substaff doctor --repair
```

Validates:

- Server configuration
- Database connectivity
- Secrets adapter configuration
- Storage configuration
- Missing key files

## `substaff configure`

Update configuration sections:

```sh
pnpm substaff configure --section server
pnpm substaff configure --section secrets
pnpm substaff configure --section storage
```

## `substaff env`

Show resolved environment configuration:

```sh
pnpm substaff env
```

## `substaff allowed-hostname`

Allow a private hostname for authenticated/private mode:

```sh
pnpm substaff allowed-hostname my-tailscale-host
```

## Local Storage Paths

| Data | Default Path |
|------|-------------|
| Config | `~/.substaff/instances/default/config.json` |
| Database | `~/.substaff/instances/default/db` |
| Logs | `~/.substaff/instances/default/logs` |
| Storage | `~/.substaff/instances/default/data/storage` |
| Secrets key | `~/.substaff/instances/default/secrets/master.key` |

Override with:

```sh
SUBSTAFF_HOME=/custom/home SUBSTAFF_INSTANCE_ID=dev pnpm substaff run
```

Or pass `--data-dir` directly on any command:

```sh
pnpm substaff run --data-dir ./tmp/substaff-dev
pnpm substaff doctor --data-dir ./tmp/substaff-dev
```
