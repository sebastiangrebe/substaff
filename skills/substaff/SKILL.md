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

**COST RULES — every turn costs money. Follow these strictly:**
- Add `?compact=true` to ALL API calls (GET and PATCH). No exceptions.
- NEVER use `curl -v`. Use `curl -s` always. Verbose output wastes thousands of tokens on TLS headers.
- NEVER echo env vars to check them — they are guaranteed set, just use them directly.
- NEVER use ToolSearch — all tools you need are already available.
- Combine independent curl calls in a single Bash call using `&` and `wait`.
- If the heartbeat result is "nothing to do" or "waiting for approval", exit in ≤4 turns total.
- When reading workspace files, use `cat file1 & cat file2 & wait` in a single Bash call — NOT individual Read tool calls. Each tool call is a separate turn.
- NEVER use `find` or `ls -R` on directories with `.git/`. Use `ls` on specific directories or `find . -not -path './.git/*'`.

## The Heartbeat Procedure

**CRITICAL — Minimize turns.** Combine independent API calls in a single turn. Goal: if no work, exit in ≤3 turns.

**Step 1 — Identity + Assignments (single Bash call, parallel curls).**

```bash
curl -s "$SUBSTAFF_API_URL/api/agents/me?compact=true" -H "Authorization: Bearer $SUBSTAFF_API_KEY" &
curl -s "$SUBSTAFF_API_URL/api/companies/$SUBSTAFF_COMPANY_ID/issues?assigneeAgentId=$SUBSTAFF_AGENT_ID&status=todo,in_progress,blocked&compact=true" -H "Authorization: Bearer $SUBSTAFF_API_KEY" &
wait
```

Use env vars directly — do NOT echo them, check them, or look them up. **If inbox is empty AND no `SUBSTAFF_TASK_ID`/`SUBSTAFF_WAKE_COMMENT_ID`/`SUBSTAFF_APPROVAL_ID`:**
- **If your role is `strategist`** (or `SUBSTAFF_STRATEGY_REVIEW=true`): proceed to Strategy Review using the `strategy` skill.
- **Otherwise**: exit immediately. Output "No tasks assigned. Exiting."

**Step 2 — Plan rejection handling (MANDATORY).** If `SUBSTAFF_WAKE_REASON` is `plan_rejected`:
1. The rejected plan and reviewer comments are **already in your prompt** (see "REJECTED PLAN" section above). Do NOT call the plans API — the data is pre-loaded.
2. **Revise your plan** based on the rejection feedback. The reviewer's comments are directives, not suggestions — follow them.
3. Submit a new plan: `POST /api/companies/{companyId}/issues/{SUBSTAFF_TASK_ID}/plans` with the revised `planMarkdown`.
4. **EXIT immediately.** Do NOT proceed to checkout, do NOT start any work, do NOT update the task status. Your only job this heartbeat is to resubmit the revised plan.

> **Why this matters:** The plan approval gate is enforced server-side. You cannot mark a task `done` or `in_progress` without an approved plan. Any work you do will be wasted. Revise and resubmit first.

**Step 3 — Approval follow-up.** If `SUBSTAFF_APPROVAL_ID` is set: `GET /api/approvals/{id}` and `GET /api/approvals/{id}/issues`. Close resolved issues or comment on open ones.

**Step 4 — Pick work.** Work on `in_progress` first, then `todo`. Skip `blocked` unless unblockable.

- **Blocked-task dedup:** Before working on a `blocked` task, `GET /api/issues/{id}/comments?limit=3`. If latest comment is yours with no newer responses, skip the task.
- If `SUBSTAFF_TASK_ID` is set and assigned to you, prioritize it.
- If woken by mention (`SUBSTAFF_WAKE_COMMENT_ID`), read that comment first. Self-assign only if explicitly asked.
- **Early exit:** If ALL tasks are blocked with no new context:
  - **IC roles** (`roleClassification: "ic"`): Exit. "All tasks blocked, no new context."
  - **Leadership** (`roleClassification: "leadership"`): Proceed to oversight duties first.

> **Context management:** After completing Steps 1–4, if you will proceed to Step 5 (checkout + work), run `/compact` first.

**Step 5 — Checkout.** Required before any work.

```
POST /api/issues/{issueId}/checkout
Headers: Authorization, X-Substaff-Run-Id
{ "agentId": "{id}", "expectedStatuses": ["todo", "backlog", "blocked"] }
```

- `409`: task owned by another agent. **Never retry.** Pick a different task.
- `422` "plan approval required": In the SAME turn, also call `GET /api/companies/$SUBSTAFF_COMPANY_ID/issues/{issueId}/plans?compact=true`. If `pending_review` plan exists, **EXIT immediately** — no comment needed. If no plan exists, submit one and exit (see Planning below).

**Step 6 — Understand context.** Recent comments are **pre-loaded in your prompt** (see "RECENT COMMENTS" section). Only call `GET /api/issues/{issueId}/comments` if you need older comments. Use `GET /api/issues/{issueId}?compact=true` for ancestors/project if needed. If `SUBSTAFF_WAKE_COMMENT_ID`, find that comment in the pre-loaded list first.

**Step 7 — Do the work.** Use your tools.

- **Workspace persistence:** Filesystem starts empty each heartbeat. Use `GET /api/agent/files` to list, `GET /api/agent/files/content/{path}` to download, `PUT /api/agent/files/content/{path}` to upload. Add `?linkTo=issue:{id}` to link files to entities. Never recreate files from memory — check storage first.
- **MCP tools:** If available, prefer MCP for delivery (PRs, messages, etc.). Report results in comments. If MCP fails twice with same error, mark task `blocked`.
- **Cross-run context:** Task comments (Step 6) are your primary context. Don't repeat work documented in comments. Use `GET /api/companies/{companyId}/knowledge/search?q=<query>` for context beyond your current task.
- **Leave structured summary comments** with key IDs, errors, decisions, and links.

**Step 8 — Update status.**

```
PATCH /api/issues/{issueId}  (Headers: X-Substaff-Run-Id)
{ "status": "done", "comment": "What was done." }
{ "status": "blocked", "comment": "Blocker and who needs to act." }
```

Status values: `backlog`, `todo`, `in_progress`, `in_review`, `done`, `blocked`, `cancelled`. Priority: `critical`, `high`, `medium`, `low`. Other fields: `title`, `description`, `priority`, `assigneeAgentId`, `projectId`, `goalId`, `parentId`, `billingCode`.

**Step 9 — Delegate.** `POST /api/companies/{companyId}/issues`. Always set `parentId` and `goalId`. Use `dependsOnIssueIds` for sequential tasks — the system handles wakeup ordering.

**Dependency rules for task decomposition:**
- **Integration tasks are mandatory.** When multiple agents produce outputs that must be combined (e.g. code + art, backend + frontend, data + report), create an explicit integration task that depends on ALL contributing tasks. Never assume the last task in a chain will "just combine everything."
- **Final validation tasks** (QA, review, demo) must depend on the integration task, not on individual contributing tasks.
- **Cross-discipline outputs:** If task A produces artifacts that task B needs (e.g. visual assets needed by an engineer), task B MUST list task A in `dependsOnIssueIds`. Do not assume agents can work with placeholders unless the task description explicitly says so.
- **Correct pattern example:** Design Doc → (Engine Setup + Art Assets in parallel) → Integration (depends on BOTH) → QA (depends on Integration).
- **Wrong pattern:** Design Doc → Engine Setup → Art Assets → QA — this lets the engine ship without art.

## Planning

When `requirePlanApproval: true` or checkout returns 422:
- Submit: `POST /api/companies/:companyId/issues/:issueId/plans` with `{ "planMarkdown": "...", "agentId": "your-id" }`
- **After submitting, EXIT immediately.** No comments, no checkout, no prep work.
- Only ONE plan per issue per heartbeat. Check for existing `pending_review` plans first.
- On rejection (`plan_rejected`): see **Step 2** above. You MUST revise based on reviewer feedback and resubmit before any work.

## Project Setup (CEO/Manager)

`POST /api/companies/{companyId}/projects` — optionally include `workspace` inline. Or `POST /api/projects/{projectId}/workspaces` after. Provide at least `cwd` or `repoUrl`.

## Comment Style

**Keep comments SHORT.** Max 10 lines. No tables, no full file trees, no repeated context. Format: status line + 3–5 bullets + links. Skip what the reader can see from the diff or task description.

**All links must include company prefix** (derived from issue identifier, e.g. `PAP-1` → `PAP`):
- Issues: `/<prefix>/issues/<identifier>` | Agents: `/<prefix>/agents/<url-key>` | Projects: `/<prefix>/projects/<url-key>` | Approvals: `/<prefix>/approvals/<id>`

## Agent Management

To unpause/resume an agent: `PATCH /api/agents/:id` with `{ "status": "idle" }`. There is NO wake, trigger, or heartbeat endpoint — the system wakes agents automatically via `wakeOnDemand` when their status is `idle` and they have tasks. Do NOT search for or guess wake endpoints.

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
