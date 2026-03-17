# Strategy Feature Implementation Plan

## Context

When all goals and tasks in a Substaff company are completed, agents go idle and exit — "No tasks assigned. Exiting." In real companies, leadership reviews metrics, analyzes outcomes, and proactively creates new goals. Substaff has no mechanism for this today.

This plan introduces a **Strategy** feature: a structured OKR/KPI data model, a dedicated UI page with charts and gauges, a `strategist` agent role with idle-review behavior, and a strategy skill that enables agents to analyze metrics and propose new objectives.

## Design Decision

**Strategy is a role + skill, not a separate system.** A strategist agent is hired like any other, sits in the org chart, and uses the existing approval workflow. The OKR/KPI data model is the core new infrastructure — any agent can report KPIs, but only strategists analyze them and propose new work.

Why not a fully separate agent/team?
- A strategy person doesn't need firsthand engineering knowledge — they read **metrics and outcomes**, which is what the OKR/KPI system provides
- Avoids wasting agent context on a standalone agent that has no institutional knowledge
- The strategist role can be assigned to any leadership agent (even the CEO could double as strategist)
- Keeps the system composable — companies that don't want autonomous strategy simply don't hire a strategist

---

## Implementation Sequence

1. DB schema (new tables)
2. Shared types, validators, constants
3. Server service + routes
4. UI API client + pages
5. Skills (strategy skill + substaff skill update)
6. Cross-cutting (sidebar, RLS migration)

---

## Layer 1: Database Schema

### 1.1 `packages/db/src/schema/objectives.ts`

The top-level OKR entity. Represents a strategic objective with a time period.

```
objectives table:
  id                uuid PK defaultRandom
  companyId         uuid FK -> companies.id NOT NULL
  title             text NOT NULL
  description       text nullable
  ownerAgentId      uuid FK -> agents.id nullable
  timePeriod        text NOT NULL default "quarterly"  -- "monthly"|"quarterly"|"annual"|"custom"
  periodStart       timestamp(tz) nullable
  periodEnd         timestamp(tz) nullable
  status            text NOT NULL default "draft"      -- "draft"|"active"|"achieved"|"cancelled"|"stalled"
  parentId          uuid self-ref FK -> objectives.id nullable
  goalId            uuid FK -> goals.id nullable       -- link to existing goal system
  approvalId        uuid FK -> approvals.id nullable   -- approval that created/approved this
  createdAt         timestamp(tz) NOT NULL defaultNow
  updatedAt         timestamp(tz) NOT NULL defaultNow

indexes:
  objectives_company_idx on (companyId)
  objectives_company_status_idx on (companyId, status)
```

### 1.2 `packages/db/src/schema/key_results.ts`

Measurable outcomes under an objective. Each KR has a target, current value, and visualization preference.

```
keyResults table:
  id                uuid PK defaultRandom
  companyId         uuid FK -> companies.id NOT NULL
  objectiveId       uuid FK -> objectives.id NOT NULL, onDelete cascade
  title             text NOT NULL
  description       text nullable
  targetValue       integer NOT NULL
  currentValue      integer NOT NULL default 0
  startingValue     integer NOT NULL default 0
  unit              text NOT NULL default "count"      -- "count"|"percent"|"currency_cents"|"seconds"|"custom"
  direction         text NOT NULL default "up"         -- "up"|"down" (is higher better?)
  visualizationType text NOT NULL default "progress"   -- "progress"|"line"|"gauge"|"bar"
  ownerAgentId      uuid FK -> agents.id nullable
  status            text NOT NULL default "active"     -- "active"|"achieved"|"at_risk"|"cancelled"
  createdAt         timestamp(tz) NOT NULL defaultNow
  updatedAt         timestamp(tz) NOT NULL defaultNow

indexes:
  key_results_company_idx on (companyId)
  key_results_objective_idx on (objectiveId)
```

### 1.3 `packages/db/src/schema/kpi_entries.ts`

Time-series data points for each key result. Any agent or user can report entries.

```
kpiEntries table:
  id              uuid PK defaultRandom
  companyId       uuid FK -> companies.id NOT NULL
  keyResultId     uuid FK -> keyResults.id NOT NULL, onDelete cascade
  value           integer NOT NULL
  recordedAt      timestamp(tz) NOT NULL defaultNow
  sourceAgentId   uuid FK -> agents.id nullable
  sourceUserId    text nullable
  note            text nullable
  createdAt       timestamp(tz) NOT NULL defaultNow

indexes:
  kpi_entries_company_idx on (companyId)
  kpi_entries_key_result_idx on (keyResultId)
  kpi_entries_recorded_at_idx on (keyResultId, recordedAt)
```

### 1.4 Update `packages/db/src/schema/index.ts`

Export the three new tables.

### 1.5 Generate + apply migration

```sh
pnpm db:generate && pnpm db:migrate
```

---

## Layer 2: Shared Types & Constants

### 2.1 `packages/shared/src/constants.ts`

- Add `"strategist"` to `AGENT_ROLES`
- Add `"strategist"` to `LEADERSHIP_ROLES`
- Add label: `strategist: "Strategist"`
- Add description: `strategist: "Strategist — reviews KPIs, analyzes outcomes, and proposes new objectives and goals when the company is idle"`
- New enum constants:
  - `OBJECTIVE_STATUSES`: `["draft", "active", "achieved", "cancelled", "stalled"]`
  - `OBJECTIVE_TIME_PERIODS`: `["monthly", "quarterly", "annual", "custom"]`
  - `KEY_RESULT_STATUSES`: `["active", "achieved", "at_risk", "cancelled"]`
  - `KEY_RESULT_UNITS`: `["count", "percent", "currency_cents", "seconds", "custom"]`
  - `KEY_RESULT_DIRECTIONS`: `["up", "down"]`
  - `KEY_RESULT_VIZ_TYPES`: `["progress", "line", "gauge", "bar"]`

### 2.2 `packages/shared/src/types/strategy.ts`

```typescript
export interface Objective {
  id: string;
  companyId: string;
  title: string;
  description: string | null;
  ownerAgentId: string | null;
  timePeriod: ObjectiveTimePeriod;
  periodStart: Date | null;
  periodEnd: Date | null;
  status: ObjectiveStatus;
  parentId: string | null;
  goalId: string | null;
  approvalId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface KeyResult {
  id: string;
  companyId: string;
  objectiveId: string;
  title: string;
  description: string | null;
  targetValue: number;
  currentValue: number;
  startingValue: number;
  unit: KeyResultUnit;
  direction: KeyResultDirection;
  visualizationType: KeyResultVizType;
  ownerAgentId: string | null;
  status: KeyResultStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface KpiEntry {
  id: string;
  companyId: string;
  keyResultId: string;
  value: number;
  recordedAt: Date;
  sourceAgentId: string | null;
  sourceUserId: string | null;
  note: string | null;
  createdAt: Date;
}

export interface KeyResultWithEntries extends KeyResult {
  entries: KpiEntry[];
  progressPercent: number;
}

export interface ObjectiveWithKeyResults extends Objective {
  keyResults: KeyResultWithEntries[];
  overallProgress: number;
}
```

### 2.3 `packages/shared/src/validators/strategy.ts`

Zod schemas:
- `createObjectiveSchema` / `updateObjectiveSchema`
- `createKeyResultSchema` / `updateKeyResultSchema`
- `createKpiEntrySchema`

### 2.4 `packages/shared/src/api.ts`

Add paths: `objectives`, `keyResults`, `kpiEntries`

---

## Layer 3: Server

### 3.1 `server/src/services/strategy.ts`

Factory function following `goalService` pattern:

- **Objectives CRUD**: `listObjectives`, `getObjectiveById`, `createObjective`, `updateObjective`, `removeObjective`
- **Key Results CRUD**: `listKeyResults`, `getKeyResultById`, `createKeyResult`, `updateKeyResult`, `removeKeyResult`
- **KPI Entries**: `listKpiEntries(keyResultId, { limit?, since? })`, `createKpiEntry` (atomically updates parent KR's `currentValue`)
- **Composite reads**: `getObjectiveWithKeyResults(id)`, `listObjectivesWithProgress(companyId)`
- **Progress calculation**: `progressPercent = ((currentValue - startingValue) / (targetValue - startingValue)) * 100`, clamped 0-100, direction-aware (for "down", invert)

### 3.2 `server/src/routes/strategy.ts`

Using `companyRouter()`, `validate()`, `logActivity()`:

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/companies/:companyId/objectives` | List all objectives |
| GET | `/api/companies/:companyId/objectives/summary` | With KR progress |
| POST | `/api/companies/:companyId/objectives` | Create objective |
| GET | `/api/objectives/:id` | Get single |
| GET | `/api/objectives/:id/details` | With key results + entries |
| PATCH | `/api/objectives/:id` | Update |
| DELETE | `/api/objectives/:id` | Delete |
| GET | `/api/objectives/:objectiveId/key-results` | List KRs |
| POST | `/api/companies/:companyId/key-results` | Create KR |
| GET | `/api/key-results/:id` | Get single KR |
| PATCH | `/api/key-results/:id` | Update KR |
| DELETE | `/api/key-results/:id` | Delete KR |
| GET | `/api/key-results/:keyResultId/entries` | List entries (query: limit, since) |
| POST | `/api/companies/:companyId/kpi-entries` | Report a data point |

Activity actions: `objective.created`, `objective.updated`, `objective.deleted`, `key_result.created`, `key_result.updated`, `key_result.deleted`, `kpi_entry.reported`

### 3.3 Register routes

Export from `server/src/routes/index.ts`, mount in `server/src/index.ts`.

---

## Layer 4: UI

### 4.1 `ui/src/api/strategy.ts`

API client following `goalsApi` pattern. Export from `ui/src/api/index.ts`.

### 4.2 `ui/src/lib/queryKeys.ts`

Add `strategy` namespace with keys for objectives, summary, detail, keyResults, kpiEntries.

### 4.3 `ui/src/pages/Strategy.tsx`

Following `Goals.tsx` pattern with `ListPreviewLayout`:

- **Header**: "Strategy" breadcrumb + "New Objective" button
- **Filters**: Status filter, time period filter
- **List**: Objective cards — title, status badge, time period, owner, overall progress bar
- **Preview pane**: Objective details, key results with progress bars, mini KPI trend charts
- **Empty state**: "No objectives yet. Create your first objective to start tracking strategy."

Inline components:
- `ObjectiveCard` — list item
- `KeyResultProgress` — progress bar with current/target, colored by status
- `KpiTrendChart` — small SVG line chart following `ActivityCharts.tsx` pattern
- `NewObjectiveDialog` — creation modal

### 4.4 `ui/src/pages/ObjectiveDetail.tsx`

Full detail page:
- Objective metadata + edit/delete
- All key results with detailed progress bars
- Larger KPI time-series charts per key result (line, gauge, bar based on `visualizationType`)
- Manual "Add KPI Entry" form
- Link to approval if exists

### 4.5 `ui/src/App.tsx`

Add routes:
```typescript
{ path: "strategy", element: <Strategy /> },
{ path: "strategy/:objectiveId", element: <ObjectiveDetail /> },
```

### 4.6 `ui/src/components/Sidebar.tsx`

Add "Strategy" nav item with `Target` icon, placed near Goals.

---

## Layer 5: Skills

### 5.1 `skills/strategy/SKILL.md`

Strategy review procedure for idle strategist agents:

1. **Gather**: Fetch `objectives/summary`, `goals/tree`, agent list
2. **Analyze**: Which KRs trending wrong? Which goals stalled? Idle agents? Measurement gaps?
3. **Act** (choose one or more):
   - Create new objectives + key results
   - Report KPIs
   - Create goals/tasks for the team
   - Submit strategy proposal via approvals API (type: `"strategy_proposal"`)
4. **Comment and exit**

Rules:
- All strategy proposals go through approval system
- Max 3 objectives per review cycle
- Every objective needs at least one key result
- Link to existing goals where possible

### 5.2 Update `skills/substaff/SKILL.md`

Change the idle exit logic:

**Current:**
> If inbox is empty AND no SUBSTAFF_TASK_ID/SUBSTAFF_WAKE_COMMENT_ID/SUBSTAFF_APPROVAL_ID, exit immediately.

**New:**
> If inbox is empty AND no SUBSTAFF_TASK_ID/SUBSTAFF_WAKE_COMMENT_ID/SUBSTAFF_APPROVAL_ID:
> - If your role is `strategist`: proceed to **Strategy Review** using the `strategy` skill
> - Otherwise: exit immediately. Output "No tasks assigned. Exiting."

### 5.3 Inject `SUBSTAFF_STRATEGY_REVIEW` env var

- In `server/src/services/heartbeat.ts` context snapshot enrichment: if agent role is `"strategist"` and no task assigned, set `contextSnapshot.strategyReview = true`
- In adapter execute files: if `context.strategyReview`, set `env.SUBSTAFF_STRATEGY_REVIEW = "true"`

---

## Layer 6: Cross-Cutting

### 6.1 RLS migration

New tables need RLS policies matching existing pattern (vendor + company isolation via `app.current_vendor_ids` / `app.current_company_ids` session variables).

### 6.2 Sidebar badges (optional)

Add at-risk key result count to sidebar badge service.

### 6.3 Dashboard card (optional)

Add OKR progress summary card to Dashboard page.

---

## How KPI Data Flows

```
Any agent completes work
  └─> POST /api/companies/{id}/kpi-entries  (e.g., QA reports test coverage)
        └─> kpi_entries row created
        └─> parent key_result.currentValue updated atomically

Strategist agent wakes idle (heartbeat timer, no tasks)
  └─> SUBSTAFF_STRATEGY_REVIEW=true injected
  └─> Skill routes to strategy review
        └─> GET /objectives/summary  (sees all KRs + trends)
        └─> GET /goals/tree          (sees completed/stalled goals)
        └─> Analyzes: "test coverage dropped 15%, deploy frequency stalled"
        └─> Creates new objective: "Improve CI/CD reliability"
        └─> Creates key results: "test coverage > 80%", "deploy frequency > 3/week"
        └─> Creates goals/tasks for engineering team
        └─> Submits strategy proposal for vendor approval

Vendor reviews on Strategy UI page
  └─> Sees objectives with progress bars, KPI trend charts
  └─> Approves/rejects strategy proposals
```

---

## Files Summary

**New files (11):**
- `packages/db/src/schema/objectives.ts`
- `packages/db/src/schema/key_results.ts`
- `packages/db/src/schema/kpi_entries.ts`
- `packages/shared/src/types/strategy.ts`
- `packages/shared/src/validators/strategy.ts`
- `server/src/services/strategy.ts`
- `server/src/routes/strategy.ts`
- `ui/src/api/strategy.ts`
- `ui/src/pages/Strategy.tsx`
- `ui/src/pages/ObjectiveDetail.tsx`
- `skills/strategy/SKILL.md`

**Modified files (14):**
- `packages/db/src/schema/index.ts`
- `packages/shared/src/constants.ts`
- `packages/shared/src/types/index.ts`
- `packages/shared/src/validators/index.ts`
- `packages/shared/src/api.ts`
- `server/src/services/index.ts`
- `server/src/routes/index.ts`
- `server/src/index.ts`
- `server/src/services/heartbeat.ts`
- `packages/adapters/e2b-sandbox/src/server/execute.ts`
- `ui/src/api/index.ts`
- `ui/src/lib/queryKeys.ts`
- `ui/src/App.tsx`
- `ui/src/components/Sidebar.tsx`
- `skills/substaff/SKILL.md`

---

## Verification

```sh
pnpm -r typecheck    # All packages compile
pnpm test:run        # All tests pass
pnpm build           # Full build succeeds
```

Manual testing:
1. Create a company, hire a strategist agent
2. Create objectives and key results via UI
3. Report KPI entries manually and verify charts render
4. Verify strategist agent enters strategy review when idle
5. Verify strategy proposals appear in approvals
6. Verify RLS isolation between vendors
