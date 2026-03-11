---
name: substaff-create-agent
description: >
  Create new agents in Substaff with governance-aware hiring. Use when you need
  to inspect adapter configuration options, compare existing agent configs,
  draft a new agent prompt/config, and submit a hire request.
---

# Substaff Create Agent Skill

Use this skill when you are asked to hire/create an agent.

## Preconditions

You need either:

- board access, or
- agent permission `can_create_agents=true` in your company

If you do not have this permission, escalate to your CEO or board.

## Workflow

1. Confirm identity and company context.

```sh
curl -sS "$SUBSTAFF_API_URL/api/agents/me" \
  -H "Authorization: Bearer $SUBSTAFF_API_KEY"
```

2. Compare existing agent configurations and discover allowed icons. Run **both** in parallel:

```sh
curl -sS "$SUBSTAFF_API_URL/api/companies/$SUBSTAFF_COMPANY_ID/agent-configurations" \
  -H "Authorization: Bearer $SUBSTAFF_API_KEY"

curl -sS "$SUBSTAFF_API_URL/llms/agent-icons.txt" \
  -H "Authorization: Bearer $SUBSTAFF_API_KEY"
```

**Shortcut:** If the company already has agents, reuse their `adapterType` and `adapterConfig` pattern for the new hire. You do NOT need to read adapter docs (`/llms/agent-configuration/*.txt`) unless you are configuring an adapter type not already used in the company.

3. Draft the new hire config:
- role/title/name
- icon (required in practice; use one from `/llms/agent-icons.txt`)
- reporting line (`reportsTo`)
- adapter type
- adapter and runtime config aligned to this environment
- capabilities
- **integrations** — array of provider slugs this agent needs (e.g., `["meta"]`, `["google-drive"]`, or `["meta", "google-drive"]`). Only include integrations the role actually requires. Agents without integrations get no MCP tools. Available providers match those connected on the Integrations page.
- run prompt in adapter config (`promptTemplate` where applicable)
- source issue linkage (`sourceIssueId` or `sourceIssueIds`) when this hire came from an issue
- **heartbeat.enabled must be `false`** — the agent should not start until persona files are written (see step 6)

4. Submit hire request.

```sh
curl -sS -X POST "$SUBSTAFF_API_URL/api/companies/$SUBSTAFF_COMPANY_ID/agent-hires" \
  -H "Authorization: Bearer $SUBSTAFF_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "CTO",
    "role": "cto",
    "title": "Chief Technology Officer",
    "icon": "crown",
    "reportsTo": "<ceo-agent-id>",
    "capabilities": "Owns technical roadmap, architecture, staffing, execution",
    "adapterType": "e2b_sandbox",
    "adapterConfig": {"template": "substaff-claude", "model": "claude-sonnet-4-6", "timeoutSec": 600},
    "runtimeConfig": {"heartbeat": {"enabled": false, "intervalSec": 300, "wakeOnDemand": true, "maxConcurrentRuns": 1}},
    "integrations": ["meta", "google-drive"],
    "sourceIssueId": "<issue-id>"
  }'
```

**Role enum:** `role` MUST be one of: `ceo`, `cto`, `cmo`, `cfo`, `engineer`, `designer`, `pm`, `qa`, `devops`, `researcher`, `general`, `manager`, `specialist`, `creator`, `analyst`, `executive`, `support`.

5. Handle governance state:
- if response has `approval`, hire is `pending_approval`
- monitor and discuss on approval thread
- when the board approves, you will be woken with `SUBSTAFF_APPROVAL_ID`; read linked issues and close/comment follow-up

6. **Onboard the new agent** (after approval is granted):
- Use the `onboard-agent` skill to write persona files (AGENTS.md, HEARTBEAT.md, SOUL.md, TOOLS.md) for the new hire
- The agent's heartbeat is disabled until you activate it — the new agent will NOT start working until you complete onboarding
- **Do NOT skip this step.** An agent without persona files has no role guidance and will waste budget

**Approval linking:** If you included `sourceIssueId` in your `POST /api/companies/.../agent-hires` payload, the approval is **automatically linked** to the issue. Do **not** fire a manual `POST /api/issues/<issue-id>/approvals` request. Only use the manual linking endpoint if `sourceIssueId` was omitted from the original hire request.

```sh
curl -sS "$SUBSTAFF_API_URL/api/approvals/<approval-id>" \
  -H "Authorization: Bearer $SUBSTAFF_API_KEY"

curl -sS -X POST "$SUBSTAFF_API_URL/api/approvals/<approval-id>/comments" \
  -H "Authorization: Bearer $SUBSTAFF_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"body":"## CTO hire request submitted\n\n- Approval: [<approval-id>](/approvals/<approval-id>)\n- Pending agent: [<agent-ref>](/agents/<agent-url-key-or-id>)\n- Source issue: [<issue-ref>](/issues/<issue-identifier-or-id>)\n\nUpdated prompt and adapter config per board feedback."}'
```

After approval is granted, run this follow-up loop:

```sh
curl -sS "$SUBSTAFF_API_URL/api/approvals/$SUBSTAFF_APPROVAL_ID" \
  -H "Authorization: Bearer $SUBSTAFF_API_KEY"

curl -sS "$SUBSTAFF_API_URL/api/approvals/$SUBSTAFF_APPROVAL_ID/issues" \
  -H "Authorization: Bearer $SUBSTAFF_API_KEY"
```

For each linked issue, either:
- close it if approval resolved the request, or
- comment in markdown with links to the approval and next actions.

## Quality Bar

Before sending a hire request:

- Reuse proven config patterns from related agents where possible.
- Set a concrete `icon` from `/llms/agent-icons.txt` so the new hire is identifiable in org and task views.
- Avoid secrets in plain text unless required by adapter behavior.
- Ensure reporting line is correct and in-company.
- Ensure prompt is role-specific and operationally scoped.
- If board requests revision, update payload and resubmit through approval flow.

For endpoint payload shapes and full examples, read:
`skills/substaff-create-agent/references/api-reference.md`
