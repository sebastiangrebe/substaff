-- Strategy feature: objectives, key_results, kpi_entries tables

CREATE TABLE IF NOT EXISTS "objectives" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid NOT NULL REFERENCES "companies"("id"),
  "title" text NOT NULL,
  "description" text,
  "owner_agent_id" uuid REFERENCES "agents"("id"),
  "time_period" text NOT NULL DEFAULT 'quarterly',
  "period_start" timestamp with time zone,
  "period_end" timestamp with time zone,
  "status" text NOT NULL DEFAULT 'draft',
  "parent_id" uuid REFERENCES "objectives"("id"),
  "goal_id" uuid REFERENCES "goals"("id"),
  "approval_id" uuid REFERENCES "approvals"("id"),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "objectives_company_idx" ON "objectives" ("company_id");
CREATE INDEX IF NOT EXISTS "objectives_company_status_idx" ON "objectives" ("company_id", "status");

CREATE TABLE IF NOT EXISTS "key_results" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid NOT NULL REFERENCES "companies"("id"),
  "objective_id" uuid NOT NULL REFERENCES "objectives"("id") ON DELETE CASCADE,
  "title" text NOT NULL,
  "description" text,
  "target_value" integer NOT NULL,
  "current_value" integer NOT NULL DEFAULT 0,
  "starting_value" integer NOT NULL DEFAULT 0,
  "unit" text NOT NULL DEFAULT 'count',
  "direction" text NOT NULL DEFAULT 'up',
  "visualization_type" text NOT NULL DEFAULT 'progress',
  "owner_agent_id" uuid REFERENCES "agents"("id"),
  "status" text NOT NULL DEFAULT 'active',
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "key_results_company_idx" ON "key_results" ("company_id");
CREATE INDEX IF NOT EXISTS "key_results_objective_idx" ON "key_results" ("objective_id");

CREATE TABLE IF NOT EXISTS "kpi_entries" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid NOT NULL REFERENCES "companies"("id"),
  "key_result_id" uuid NOT NULL REFERENCES "key_results"("id") ON DELETE CASCADE,
  "value" integer NOT NULL,
  "recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
  "source_agent_id" uuid REFERENCES "agents"("id"),
  "source_user_id" text,
  "note" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "kpi_entries_company_idx" ON "kpi_entries" ("company_id");
CREATE INDEX IF NOT EXISTS "kpi_entries_key_result_idx" ON "kpi_entries" ("key_result_id");
CREATE INDEX IF NOT EXISTS "kpi_entries_recorded_at_idx" ON "kpi_entries" ("key_result_id", "recorded_at");

-- RLS policies for tenant isolation
ALTER TABLE "objectives" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "objectives_tenant_isolation" ON "objectives"
  USING (public.rls_check_id('app.current_company_ids', company_id));

ALTER TABLE "key_results" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "key_results_tenant_isolation" ON "key_results"
  USING (public.rls_check_id('app.current_company_ids', company_id));

ALTER TABLE "kpi_entries" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "kpi_entries_tenant_isolation" ON "kpi_entries"
  USING (public.rls_check_id('app.current_company_ids', company_id));
