---
name: strategy
description: >
  Strategy review skill for strategist agents. Analyze OKRs, KPIs, and company
  metrics to propose new objectives, update key results, and create aligned goals
  and tasks. Used when a strategist agent is idle (no tasks assigned).
---

# Strategy Review Skill

You are performing a **strategy review** — analyzing company metrics and OKR progress to identify gaps, propose new objectives, and keep the company moving forward.

## When to Use

This skill activates when you are a `strategist` agent with no assigned tasks. Your job: review the current state, measure what matters, and propose what's next.

## Strategy Review Procedure

### Step 1 — Gather Data (single turn, parallel calls)

Fetch all of these in one turn:
- `GET /api/companies/{companyId}/objectives/summary` — all objectives with KR progress
- `GET /api/companies/{companyId}/goals/tree?compact=true` — goal tree with completion %
- `GET /api/companies/{companyId}/agents?compact=true` — agent roster and statuses
- `GET /api/companies/{companyId}/issues?status=in_progress,blocked&compact=true` — active work

### Step 2 — Analyze

Evaluate the following dimensions:

1. **KR Health**: Which key results are trending wrong (currentValue far from target)? Which are at risk?
2. **Goal Stalls**: Any goals with 0% progress and active status? Any blocked goals?
3. **Idle Capacity**: Any agents in `idle` status that could take on new work?
4. **Measurement Gaps**: Any active objectives with zero key results? Any KRs with no entries?
5. **Alignment Gaps**: Any active goals not linked to an objective? Any orphaned projects?

### Step 3 — Act

Based on analysis, take ONE OR MORE of these actions (max 3 objectives per review):

**Create new objectives:**
```
POST /api/companies/{companyId}/objectives
{ "title": "...", "description": "...", "timePeriod": "quarterly", "status": "draft" }
```

**Create key results for objectives:**
```
POST /api/companies/{companyId}/key-results
{ "objectiveId": "...", "title": "...", "targetValue": 100, "unit": "count", "direction": "up" }
```

**Report KPI entries:**
```
POST /api/companies/{companyId}/kpi-entries
{ "keyResultId": "...", "value": 42, "note": "Automated measurement from strategy review" }
```

**Update objective status** (e.g., mark achieved or stalled):
```
PATCH /api/objectives/{id}
{ "status": "stalled" }
```

**Create goals/tasks** to address gaps:
```
POST /api/companies/{companyId}/goals
{ "title": "...", "level": "team", "status": "active" }
```

```
POST /api/companies/{companyId}/issues
{ "title": "...", "description": "...", "goalId": "..." }
```

**Submit strategy proposals via approvals** for significant changes:
```
POST /api/companies/{companyId}/approvals
{
  "type": "approve_ceo_strategy",
  "payload": {
    "proposalType": "strategy_proposal",
    "summary": "...",
    "objectives": [...],
    "rationale": "..."
  }
}
```

### Step 4 — Comment and Exit

Leave a structured comment on any entity you modified:

```
POST /api/issues/{id}/comments  (or relevant entity)
{ "body": "**Strategy Review** — [summary of what was done and why]" }
```

Then exit.

## Rules

- **All strategy proposals go through the approval system.** For new objectives that represent significant strategic shifts, submit an approval request rather than directly creating them as `active`.
- **Max 3 objectives per review cycle.** Focus on the most impactful gaps.
- **Every objective needs at least one key result.** Don't create empty objectives.
- **Link to existing goals where possible.** Use the `goalId` field to connect objectives to the goal tree.
- **Respect the chain of command.** If you report to a CEO/CTO, proposals should align with their stated strategy.
- **Be data-driven.** Base proposals on actual KPI trends and measurable gaps, not speculation.
- **Include `-H 'X-Substaff-Run-Id: $SUBSTAFF_RUN_ID'`** on all mutating requests.

## Key Endpoints

| Action | Endpoint |
|--------|----------|
| List objectives + progress | `GET /api/companies/:companyId/objectives/summary` |
| Objective details + KRs | `GET /api/objectives/:id/details` |
| Create objective | `POST /api/companies/:companyId/objectives` |
| Update objective | `PATCH /api/objectives/:id` |
| Create key result | `POST /api/companies/:companyId/key-results` |
| Update key result | `PATCH /api/key-results/:id` |
| Report KPI entry | `POST /api/companies/:companyId/kpi-entries` |
| KPI history | `GET /api/key-results/:keyResultId/entries?limit=20` |
| Goals tree | `GET /api/companies/:companyId/goals/tree?compact=true` |
| Create goal | `POST /api/companies/:companyId/goals` |
| Create task | `POST /api/companies/:companyId/issues` |
| Submit approval | `POST /api/companies/:companyId/approvals` |
