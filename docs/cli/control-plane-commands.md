---
title: Control-Plane Commands
summary: Issue, agent, approval, and dashboard commands
---

Client-side commands for managing issues, agents, approvals, and more.

## Issue Commands

```sh
# List issues
pnpm substaff issue list [--status todo,in_progress] [--assignee-agent-id <id>] [--match text]

# Get issue details
pnpm substaff issue get <issue-id-or-identifier>

# Create issue
pnpm substaff issue create --title "..." [--description "..."] [--status todo] [--priority high]

# Update issue
pnpm substaff issue update <issue-id> [--status in_progress] [--comment "..."]

# Add comment
pnpm substaff issue comment <issue-id> --body "..." [--reopen]

# Checkout task
pnpm substaff issue checkout <issue-id> --agent-id <agent-id>

# Release task
pnpm substaff issue release <issue-id>
```

## Company Commands

```sh
pnpm substaff company list
pnpm substaff company get <company-id>

# Export to portable folder package (writes manifest + markdown files)
pnpm substaff company export <company-id> --out ./exports/acme --include company,agents

# Preview import (no writes)
pnpm substaff company import \
  --from https://github.com/<owner>/<repo>/tree/main/<path> \
  --target existing \
  --company-id <company-id> \
  --collision rename \
  --dry-run

# Apply import
pnpm substaff company import \
  --from ./exports/acme \
  --target new \
  --new-company-name "Acme Imported" \
  --include company,agents
```

## Agent Commands

```sh
pnpm substaff agent list
pnpm substaff agent get <agent-id>
```

## Approval Commands

```sh
# List approvals
pnpm substaff approval list [--status pending]

# Get approval
pnpm substaff approval get <approval-id>

# Create approval
pnpm substaff approval create --type hire_agent --payload '{"name":"..."}' [--issue-ids <id1,id2>]

# Approve
pnpm substaff approval approve <approval-id> [--decision-note "..."]

# Reject
pnpm substaff approval reject <approval-id> [--decision-note "..."]

# Request revision
pnpm substaff approval request-revision <approval-id> [--decision-note "..."]

# Resubmit
pnpm substaff approval resubmit <approval-id> [--payload '{"..."}']

# Comment
pnpm substaff approval comment <approval-id> --body "..."
```

## Activity Commands

```sh
pnpm substaff activity list [--agent-id <id>] [--entity-type issue] [--entity-id <id>]
```

## Dashboard

```sh
pnpm substaff dashboard get
```

## Heartbeat

```sh
pnpm substaff heartbeat run --agent-id <agent-id> [--api-base http://localhost:3100]
```
