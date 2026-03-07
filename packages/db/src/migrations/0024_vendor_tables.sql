-- Create vendor-related tables and add vendor_id to existing tables.
-- This migration must run BEFORE the RLS migration (0025).

-- ============================================================
-- vendors
-- ============================================================
CREATE TABLE IF NOT EXISTS "vendors" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" text NOT NULL,
  "slug" text NOT NULL UNIQUE,
  "billing_email" text NOT NULL,
  "stripe_customer_id" text,
  "plan" text NOT NULL DEFAULT 'free',
  "plan_token_limit" integer NOT NULL DEFAULT 100000,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "vendors_slug_idx" ON "vendors" ("slug");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "vendors_stripe_customer_idx" ON "vendors" ("stripe_customer_id");
--> statement-breakpoint

-- ============================================================
-- vendor_memberships
-- ============================================================
CREATE TABLE IF NOT EXISTS "vendor_memberships" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "vendor_id" uuid NOT NULL REFERENCES "vendors"("id") ON DELETE CASCADE,
  "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "role" text NOT NULL DEFAULT 'member',
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "vendor_memberships_vendor_user_unique_idx" ON "vendor_memberships" ("vendor_id", "user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "vendor_memberships_vendor_role_idx" ON "vendor_memberships" ("vendor_id", "role");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "vendor_memberships_user_idx" ON "vendor_memberships" ("user_id");
--> statement-breakpoint

-- ============================================================
-- vendor_usage
-- ============================================================
CREATE TABLE IF NOT EXISTS "vendor_usage" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "vendor_id" uuid NOT NULL REFERENCES "vendors"("id") ON DELETE CASCADE,
  "period_start" timestamp with time zone NOT NULL,
  "period_end" timestamp with time zone NOT NULL,
  "total_tokens_used" bigint NOT NULL DEFAULT 0,
  "total_cost_cents" integer NOT NULL DEFAULT 0,
  "plan_limit" integer NOT NULL,
  "hard_cap_reached" boolean NOT NULL DEFAULT false,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "vendor_usage_vendor_period_unique_idx" ON "vendor_usage" ("vendor_id", "period_start");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "vendor_usage_vendor_period_idx" ON "vendor_usage" ("vendor_id", "period_end");
--> statement-breakpoint

-- ============================================================
-- org_templates
-- ============================================================
CREATE TABLE IF NOT EXISTS "org_templates" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "vendor_id" uuid REFERENCES "vendors"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "slug" text NOT NULL UNIQUE,
  "description" text,
  "category" text NOT NULL DEFAULT 'general',
  "template_data" jsonb NOT NULL,
  "is_builtin" boolean NOT NULL DEFAULT false,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "org_templates_category_idx" ON "org_templates" ("category");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "org_templates_vendor_idx" ON "org_templates" ("vendor_id");
--> statement-breakpoint

-- ============================================================
-- integration_connections
-- ============================================================
CREATE TABLE IF NOT EXISTS "integration_connections" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "vendor_id" uuid NOT NULL REFERENCES "vendors"("id") ON DELETE CASCADE,
  "company_id" uuid NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
  "provider" text NOT NULL,
  "access_token" text NOT NULL,
  "refresh_token" text,
  "scopes" text,
  "expires_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "integration_connections_company_provider_unique_idx" ON "integration_connections" ("company_id", "provider");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "integration_connections_vendor_idx" ON "integration_connections" ("vendor_id");
--> statement-breakpoint

-- ============================================================
-- task_plans
-- ============================================================
CREATE TABLE IF NOT EXISTS "task_plans" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid NOT NULL REFERENCES "companies"("id"),
  "issue_id" uuid NOT NULL REFERENCES "issues"("id") ON DELETE CASCADE,
  "agent_id" uuid NOT NULL REFERENCES "agents"("id"),
  "plan_markdown" text NOT NULL,
  "status" text NOT NULL DEFAULT 'draft',
  "version" integer NOT NULL DEFAULT 1,
  "reviewer_comments" jsonb,
  "approved_by_user_id" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "approved_at" timestamp with time zone,
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "task_plans_company_issue_idx" ON "task_plans" ("company_id", "issue_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "task_plans_issue_status_idx" ON "task_plans" ("issue_id", "status");
--> statement-breakpoint

-- ============================================================
-- project_state
-- ============================================================
CREATE TABLE IF NOT EXISTS "project_state" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "project_id" uuid NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
  "company_id" uuid NOT NULL REFERENCES "companies"("id"),
  "state_json" jsonb,
  "state_markdown" text,
  "version" integer NOT NULL DEFAULT 1,
  "updated_by_agent_id" uuid REFERENCES "agents"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "project_state_project_version_idx" ON "project_state" ("project_id", "version");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "project_state_company_idx" ON "project_state" ("company_id");
--> statement-breakpoint

-- ============================================================
-- Add vendor_id to existing tables
-- ============================================================

-- Create a default vendor for existing data
INSERT INTO "vendors" ("id", "name", "slug", "billing_email")
VALUES ('00000000-0000-0000-0000-000000000001', 'Default', 'default', 'admin@localhost')
ON CONFLICT ("slug") DO NOTHING;
--> statement-breakpoint

-- companies: add vendor_id (nullable first, backfill, then set NOT NULL)
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "vendor_id" uuid REFERENCES "vendors"("id") ON DELETE CASCADE;
--> statement-breakpoint
UPDATE "companies" SET "vendor_id" = '00000000-0000-0000-0000-000000000001' WHERE "vendor_id" IS NULL;
--> statement-breakpoint
ALTER TABLE "companies" ALTER COLUMN "vendor_id" SET NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "companies_vendor_idx" ON "companies" ("vendor_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "companies_vendor_status_idx" ON "companies" ("vendor_id", "status");
--> statement-breakpoint

-- cost_events: add vendor_id (nullable first, backfill, then set NOT NULL)
ALTER TABLE "cost_events" ADD COLUMN IF NOT EXISTS "vendor_id" uuid REFERENCES "vendors"("id");
--> statement-breakpoint
UPDATE "cost_events" SET "vendor_id" = (
  SELECT c."vendor_id" FROM "companies" c WHERE c."id" = "cost_events"."company_id"
) WHERE "vendor_id" IS NULL;
--> statement-breakpoint
-- Set NOT NULL only if all rows have been backfilled
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "cost_events" WHERE "vendor_id" IS NULL) THEN
    ALTER TABLE "cost_events" ALTER COLUMN "vendor_id" SET NOT NULL;
  END IF;
END $$;
--> statement-breakpoint

-- ============================================================
-- Add missing columns to companies
-- ============================================================
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "require_plan_approval" boolean NOT NULL DEFAULT false;
--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "org_chart_data" jsonb;
