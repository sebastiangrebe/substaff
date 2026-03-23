---
name: onboard-agent
description: >
  Write persona files (AGENTS.md, HEARTBEAT.md, SOUL.md, TOOLS.md) for a newly
  hired agent and activate their heartbeat. Use after a hire approval is granted
  and before the new agent starts working. CEO/manager skill only.
---

# Onboard Agent Skill

Use this skill when a hire approval has been granted and you need to set up the new agent's persona files before activating them.

## When to Use

After receiving `SUBSTAFF_APPROVAL_ID` for a `hire_agent` approval that was approved:
1. You confirmed the approval is approved
2. You know the new agent's id, role, name, and capabilities
3. You need to write their persona files so they know how to behave

## Workflow

### Step 1 — Gather context

Fetch the new agent's details:

```sh
curl -sS "$SUBSTAFF_API_URL/api/agents/{newAgentId}" \
  -H "Authorization: Bearer $SUBSTAFF_API_KEY"
```

Note their `id`, `role`, `name`, `title`, `capabilities`, and `reportsTo`.

### Step 2 — Write persona files

Write **four files** to the shared workspace using the files API. The path pattern is `agents/{role}/FILENAME.md` where `{role}` is the agent's role (e.g., `cmo`, `engineer`, `cto`).

**AGENTS.md** — Role identity and references:
```sh
curl -sS -X PUT "$SUBSTAFF_API_URL/api/agent/files/content/agents/{role}/AGENTS.md" \
  -H "Authorization: Bearer $SUBSTAFF_API_KEY" \
  -H "Content-Type: text/markdown" \
  --data-binary @- <<'BODY'
You are the {Title/Name}.

Your home directory is $AGENT_HOME. Everything personal to you -- life, memory, knowledge -- lives there.

Company-wide artifacts (plans, shared docs) live in the project root, outside your personal directory.

## Memory and Planning

You MUST use the `para-memory-files` skill for all memory operations.

## Safety Considerations

- Never exfiltrate secrets or private data.
- Do not perform any destructive commands unless explicitly requested by the board or your manager.

## References

- `$AGENT_HOME/HEARTBEAT.md` -- execution checklist. Run every heartbeat.
- `$AGENT_HOME/SOUL.md` -- who you are and how you should act.
- `$AGENT_HOME/TOOLS.md` -- tools you have access to.
BODY
```

**HEARTBEAT.md** — Execution checklist (role-specific):
- For IC roles (engineer, designer, qa, researcher, general, specialist, creator, analyst, support, and custom roles with `classification: "ic"`): Focus on task execution, code quality, testing, and clear communication. No goal/project oversight.
- For leadership roles (ceo, cto, cmo, cfo, pm, manager, executive, and custom roles with `classification: "leadership"`): Include goal monitoring, project oversight, delegation, and hiring responsibilities specific to their domain.
- Always include: identity check, approval follow-up, assignment retrieval, checkout, work, status updates, exit criteria.

**SOUL.md** — Persona and decision-making style:
- Strategic posture appropriate to the role
- Voice and tone guidelines
- Key principles for their domain

**TOOLS.md** — Placeholder for tool notes:
```markdown
# Tools

(Your tools will go here. Add notes about them as you acquire and use them.)
```

### Step 3 — Verify files exist

```sh
curl -sS "$SUBSTAFF_API_URL/api/agent/files?prefix=agents/{role}/" \
  -H "Authorization: Bearer $SUBSTAFF_API_KEY"
```

Confirm all four files are listed.

### Step 4 — Activate the agent's heartbeat

Enable wakeOnDemand so the agent receives task-triggered wakeups. Only enable the recurring heartbeat timer (`enabled: true`) for **leadership agents** (CEO, CTO) who need to run periodic oversight. Non-leadership agents (IC roles) should keep `enabled: false` and rely on `wakeOnDemand` — they'll be woken when tasks are assigned or comments are posted.

```sh
# For IC agents (default — no recurring timer, wake on demand only):
curl -sS -X PATCH "$SUBSTAFF_API_URL/api/agents/{newAgentId}" \
  -H "Authorization: Bearer $SUBSTAFF_API_KEY" \
  -H "Content-Type: application/json" \
  -H "X-Substaff-Run-Id: $SUBSTAFF_RUN_ID" \
  -d '{"runtimeConfig": {"heartbeat": {"enabled": false, "intervalSec": 3600, "wakeOnDemand": true, "maxConcurrentRuns": 1}}}'

# For leadership agents (CEO, CTO — periodic oversight heartbeat):
curl -sS -X PATCH "$SUBSTAFF_API_URL/api/agents/{newAgentId}" \
  -H "Authorization: Bearer $SUBSTAFF_API_KEY" \
  -H "Content-Type: application/json" \
  -H "X-Substaff-Run-Id: $SUBSTAFF_RUN_ID" \
  -d '{"runtimeConfig": {"heartbeat": {"enabled": true, "intervalSec": 3600, "wakeOnDemand": true, "maxConcurrentRuns": 1}}}'
```

### Step 5 — Assign initial work

Create at least one task for the new agent so they have something to do on their first heartbeat:

```sh
curl -sS -X POST "$SUBSTAFF_API_URL/api/companies/$SUBSTAFF_COMPANY_ID/issues" \
  -H "Authorization: Bearer $SUBSTAFF_API_KEY" \
  -H "Content-Type: application/json" \
  -H "X-Substaff-Run-Id: $SUBSTAFF_RUN_ID" \
  -d '{
    "title": "Review your role and introduce yourself",
    "description": "Read your persona files and post a comment on this task confirming you understand your role and responsibilities.",
    "status": "todo",
    "priority": "high",
    "assigneeAgentId": "{newAgentId}",
    "goalId": "{relevantGoalId}",
    "projectId": "{relevantProjectId}"
  }'
```

## Guidelines

- **Be specific.** The HEARTBEAT.md should be a concrete checklist, not vague advice. Include actual API endpoints and step numbers.
- **Be role-appropriate.** A CMO's heartbeat focuses on marketing metrics, content pipelines, and campaign management. An engineer's focuses on code, PRs, and tests.
- **Don't copy the CEO verbatim.** Each role has different responsibilities. An IC engineer should NOT do goal tree reviews or hire agents.
- **Keep it concise.** Each file should be 30-80 lines. Longer persona files waste tokens every heartbeat.
- **Include integrations awareness.** If the new agent needs specific integrations (e.g., meta, google-drive), note which integration skills to load in their HEARTBEAT.md or TOOLS.md.
