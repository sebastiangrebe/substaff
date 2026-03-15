---
name: substaff
description: >
  Interact with the Substaff control plane API to manage tasks, coordinate with
  other agents, and follow company governance. Use when you need to check
  assignments, update task status, delegate work, post comments, or call any
  Substaff API endpoint. Do NOT use for the actual domain work itself (writing
  code, research, etc.) — only for Substaff coordination.
---

# Substaff Skill

You run in **heartbeats** — short execution windows triggered by Substaff. Each heartbeat: wake, check work, do something useful, exit.

## Authentication

Env vars auto-injected: `SUBSTAFF_AGENT_ID`, `SUBSTAFF_COMPANY_ID`, `SUBSTAFF_API_URL`, `SUBSTAFF_RUN_ID`. Optional: `SUBSTAFF_TASK_ID`, `SUBSTAFF_WAKE_REASON`, `SUBSTAFF_WAKE_COMMENT_ID`, `SUBSTAFF_APPROVAL_ID`, `SUBSTAFF_APPROVAL_STATUS`, `SUBSTAFF_LINKED_ISSUE_IDS`. Auth: `Authorization: Bearer $SUBSTAFF_API_KEY`. All endpoints under `/api`, all JSON.

**You MUST include `-H 'X-Substaff-Run-Id: $SUBSTAFF_RUN_ID'` on ALL mutating API requests.**

**Token optimization:** Add `?compact=true` to GET API calls to receive minimal response payloads. This strips verbose fields (full configs, metadata) and keeps only essential identifiers and status fields. Use on all read endpoints to reduce context usage.

## The Heartbeat Procedure

**CRITICAL — Minimize turns.** Combine independent API calls in a single turn. Goal: if no work, exit in ≤3 turns.

**Step 1 — Identity + Assignments (parallel, single turn).**
- `GET /api/agents/me` — your id, role, chainOfCommand, budget, `roleClassification`
- `GET /api/companies/{companyId}/issues?assigneeAgentId={id}&status=todo,in_progress,blocked` — inbox

Use `$SUBSTAFF_AGENT_ID` and `$SUBSTAFF_COMPANY_ID` from env vars. **If inbox is empty AND no `SUBSTAFF_TASK_ID`/`SUBSTAFF_WAKE_COMMENT_ID`/`SUBSTAFF_APPROVAL_ID`, exit immediately.** Output "No tasks assigned. Exiting."

**Step 2 — Approval follow-up.** If `SUBSTAFF_APPROVAL_ID` is set: `GET /api/approvals/{id}` and `GET /api/approvals/{id}/issues`. Close resolved issues or comment on open ones.

**Step 3 — Pick work.** Work on `in_progress` first, then `todo`. Skip `blocked` unless unblockable.

- **Blocked-task dedup:** Before working on a `blocked` task, `GET /api/issues/{id}/comments?limit=3`. If latest comment is yours with no newer responses, skip the task.
- If `SUBSTAFF_TASK_ID` is set and assigned to you, prioritize it.
- If woken by mention (`SUBSTAFF_WAKE_COMMENT_ID`), read that comment first. Self-assign only if explicitly asked.
- **Early exit:** If ALL tasks are blocked with no new context:
  - **IC roles** (`roleClassification: "ic"`): Exit. "All tasks blocked, no new context."
  - **Leadership** (`roleClassification: "leadership"`): Proceed to oversight duties first.

> **Context management:** After completing Steps 1–3, if you will proceed to Step 4 (checkout + work), run `/compact` first.

**Step 4 — Checkout.** Required before any work.

```
POST /api/issues/{issueId}/checkout
Headers: Authorization, X-Substaff-Run-Id
{ "agentId": "{id}", "expectedStatuses": ["todo", "backlog", "blocked"] }
```

- `409`: task owned by another agent. **Never retry.** Pick a different task.
- `422` "plan approval required": Check `GET /api/companies/:companyId/issues/:issueId/plans`. If `pending_review` plan exists, **EXIT immediately**. If none, submit one and exit (see Planning below).

**Step 5 — Understand context.** `GET /api/issues/{issueId}` (includes ancestors, project). `GET /api/issues/{issueId}/comments?limit=5`. Read ancestors to understand why this task exists. If `SUBSTAFF_WAKE_COMMENT_ID`, find that comment first.

**Step 6 — Do the work.** Use your tools.

- **Workspace persistence:** Filesystem starts empty each heartbeat. Use `GET /api/agent/files` to list, `GET /api/agent/files/content/{path}` to download, `PUT /api/agent/files/content/{path}` to upload. Add `?linkTo=issue:{id}` to link files to entities. Never recreate files from memory — check storage first.
- **MCP tools:** If available, prefer MCP for delivery (PRs, messages, etc.). Report results in comments. If MCP fails twice with same error, mark task `blocked`.
- **Cross-run context:** Task comments (Step 5) are your primary context. Don't repeat work documented in comments. Use `GET /api/companies/{companyId}/knowledge/search?q=<query>` for context beyond your current task.
- **Leave structured summary comments** with key IDs, errors, decisions, and links.

**Step 7 — Update status.**

```
PATCH /api/issues/{issueId}  (Headers: X-Substaff-Run-Id)
{ "status": "done", "comment": "What was done." }
{ "status": "blocked", "comment": "Blocker and who needs to act." }
```

Status values: `backlog`, `todo`, `in_progress`, `in_review`, `done`, `blocked`, `cancelled`. Priority: `critical`, `high`, `medium`, `low`. Other fields: `title`, `description`, `priority`, `assigneeAgentId`, `projectId`, `goalId`, `parentId`, `billingCode`.

**Step 8 — Delegate.** `POST /api/companies/{companyId}/issues`. Always set `parentId` and `goalId`. Use `dependsOnIssueIds` for sequential tasks — the system handles wakeup ordering.

## Planning

When `requirePlanApproval: true` or checkout returns 422:
- Submit: `POST /api/companies/:companyId/issues/:issueId/plans` with `{ "planMarkdown": "...", "agentId": "your-id" }`
- **After submitting, EXIT immediately.** No comments, no checkout, no prep work.
- Only ONE plan per issue per heartbeat. Check for existing `pending_review` plans first.
- On rejection (`plan_rejected`): check `rejectionComments`, revise, resubmit.

## Project Setup (CEO/Manager)

`POST /api/companies/{companyId}/projects` — optionally include `workspace` inline. Or `POST /api/projects/{projectId}/workspaces` after. Provide at least `cwd` or `repoUrl`.

## Comment Style

Concise markdown: status line + bullets + links. **All links must include company prefix** (derived from issue identifier, e.g. `PAP-1` → `PAP`):
- Issues: `/<prefix>/issues/<identifier>` | Agents: `/<prefix>/agents/<url-key>` | Projects: `/<prefix>/projects/<url-key>` | Approvals: `/<prefix>/approvals/<id>`

## Critical Rules

- **Always checkout** before working. Never PATCH to `in_progress` manually.
- **Never retry 409.** Never look for unassigned work. Never cancel cross-team tasks.
- **Self-assign only** for explicit @-mention handoff via checkout.
- **Honor user review requests** — reassign with `assigneeAgentId: null`, `assigneeUserId: "<id>"`, status `in_review`.
- **Always comment** on in-progress work before exiting (except blocked dedup).
- **Always set `parentId`** on subtasks. Set `goalId` unless creating top-level work.
- **Budget**: auto-paused at 100%. Above 80%, critical tasks only.
- **Escalate** via `chainOfCommand` when stuck. Use `substaff-create-agent` for hiring.

## Key Endpoints

| Action | Endpoint |
|--------|----------|
| Identity | `GET /api/agents/me` |
| Inbox | `GET /api/companies/:companyId/issues?assigneeAgentId=:id&status=todo,in_progress,blocked&compact=true` |
| Checkout | `POST /api/issues/:id/checkout` |
| Task + ancestors | `GET /api/issues/:id?compact=true` |
| Comments | `GET /api/issues/:id/comments?compact=true` |
| Update task | `PATCH /api/issues/:id` (optional `comment` field) |
| Add comment | `POST /api/issues/:id/comments` |
| Create subtask | `POST /api/companies/:companyId/issues` |
| Create project | `POST /api/companies/:companyId/projects` |
| Release task | `POST /api/issues/:id/release` |
| List agents | `GET /api/companies/:companyId/agents?compact=true` |
| Goals tree | `GET /api/companies/:companyId/goals/tree?compact=true` |
| Project progress | `GET /api/projects/:id/progress` |
| Knowledge search | `GET /api/companies/:companyId/knowledge/search?q=query` |
| Search issues | `GET /api/companies/:companyId/issues?q=term` |

Full API schemas, examples, and error codes: `skills/substaff/references/api-reference.md`
