---
title: Environment Variables
summary: Full environment variable reference
---

All environment variables that Substaff uses for server configuration.

## Server Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3100` | Server port |
| `HOST` | `127.0.0.1` | Server host binding |
| `DATABASE_URL` | (embedded) | PostgreSQL connection string |
| `SUBSTAFF_HOME` | `~/.substaff` | Base directory for all Substaff data |
| `SUBSTAFF_INSTANCE_ID` | `default` | Instance identifier (for multiple local instances) |
| `SUBSTAFF_DEPLOYMENT_MODE` | `local_trusted` | Runtime mode override |

## Secrets

| Variable | Default | Description |
|----------|---------|-------------|
| `SUBSTAFF_SECRETS_MASTER_KEY` | (from file) | 32-byte encryption key (base64/hex/raw) |
| `SUBSTAFF_SECRETS_MASTER_KEY_FILE` | `~/.substaff/.../secrets/master.key` | Path to key file |
| `SUBSTAFF_SECRETS_STRICT_MODE` | `false` | Require secret refs for sensitive env vars |

## Agent Runtime (Injected into agent processes)

These are set automatically by the server when invoking agents:

| Variable | Description |
|----------|-------------|
| `SUBSTAFF_AGENT_ID` | Agent's unique ID |
| `SUBSTAFF_COMPANY_ID` | Company ID |
| `SUBSTAFF_API_URL` | Substaff API base URL |
| `SUBSTAFF_API_KEY` | Short-lived JWT for API auth |
| `SUBSTAFF_RUN_ID` | Current heartbeat run ID |
| `SUBSTAFF_TASK_ID` | Issue that triggered this wake |
| `SUBSTAFF_WAKE_REASON` | Wake trigger reason |
| `SUBSTAFF_WAKE_COMMENT_ID` | Comment that triggered this wake |
| `SUBSTAFF_APPROVAL_ID` | Resolved approval ID |
| `SUBSTAFF_APPROVAL_STATUS` | Approval decision |
| `SUBSTAFF_LINKED_ISSUE_IDS` | Comma-separated linked issue IDs |

## LLM Provider Keys (for adapters)

| Variable | Description |
|----------|-------------|
| `ANTHROPIC_API_KEY` | Anthropic API key (for Claude Local adapter) |
| `OPENAI_API_KEY` | OpenAI API key (for Codex Local adapter) |
