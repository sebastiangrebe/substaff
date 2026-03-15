-- Multi-level budgets: add budget/spend columns to goals, projects, issues
-- and total budget/spend columns to companies and agents

-- Goals: monthly + total budget and spend
ALTER TABLE "goals"
  ADD COLUMN "budget_monthly_cents" integer NOT NULL DEFAULT 0,
  ADD COLUMN "spent_monthly_cents" integer NOT NULL DEFAULT 0,
  ADD COLUMN "platform_spent_monthly_cents" integer NOT NULL DEFAULT 0,
  ADD COLUMN "budget_total_cents" integer NOT NULL DEFAULT 0,
  ADD COLUMN "spent_total_cents" integer NOT NULL DEFAULT 0,
  ADD COLUMN "platform_spent_total_cents" integer NOT NULL DEFAULT 0;

-- Projects: monthly + total budget and spend
ALTER TABLE "projects"
  ADD COLUMN "budget_monthly_cents" integer NOT NULL DEFAULT 0,
  ADD COLUMN "spent_monthly_cents" integer NOT NULL DEFAULT 0,
  ADD COLUMN "platform_spent_monthly_cents" integer NOT NULL DEFAULT 0,
  ADD COLUMN "budget_total_cents" integer NOT NULL DEFAULT 0,
  ADD COLUMN "spent_total_cents" integer NOT NULL DEFAULT 0,
  ADD COLUMN "platform_spent_total_cents" integer NOT NULL DEFAULT 0;

-- Issues: monthly + total budget and spend
ALTER TABLE "issues"
  ADD COLUMN "budget_monthly_cents" integer NOT NULL DEFAULT 0,
  ADD COLUMN "spent_monthly_cents" integer NOT NULL DEFAULT 0,
  ADD COLUMN "platform_spent_monthly_cents" integer NOT NULL DEFAULT 0,
  ADD COLUMN "budget_total_cents" integer NOT NULL DEFAULT 0,
  ADD COLUMN "spent_total_cents" integer NOT NULL DEFAULT 0,
  ADD COLUMN "platform_spent_total_cents" integer NOT NULL DEFAULT 0;

-- Companies: add total budget and spend (monthly already exists)
ALTER TABLE "companies"
  ADD COLUMN "budget_total_cents" integer NOT NULL DEFAULT 0,
  ADD COLUMN "spent_total_cents" integer NOT NULL DEFAULT 0,
  ADD COLUMN "platform_spent_total_cents" integer NOT NULL DEFAULT 0;

-- Agents: add total budget and spend (monthly already exists)
ALTER TABLE "agents"
  ADD COLUMN "budget_total_cents" integer NOT NULL DEFAULT 0,
  ADD COLUMN "spent_total_cents" integer NOT NULL DEFAULT 0,
  ADD COLUMN "platform_spent_total_cents" integer NOT NULL DEFAULT 0;
