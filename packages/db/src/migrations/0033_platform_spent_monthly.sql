-- Add platform_spent_monthly_cents to agents and companies
-- This column tracks the marked-up (platform) cost separately from raw LLM cost.
-- API responses use this value so raw LLM costs are never exposed to users.

ALTER TABLE "agents" ADD COLUMN "platform_spent_monthly_cents" integer NOT NULL DEFAULT 0;
ALTER TABLE "companies" ADD COLUMN "platform_spent_monthly_cents" integer NOT NULL DEFAULT 0;

-- Backfill: set platform_spent_monthly_cents equal to spentMonthlyCents * default markup (1.5x)
-- for any existing data. Adjust if vendors have custom markup values.
UPDATE "agents" SET "platform_spent_monthly_cents" = ROUND("spent_monthly_cents" * 1.5)
  WHERE "spent_monthly_cents" > 0;
UPDATE "companies" SET "platform_spent_monthly_cents" = ROUND("spent_monthly_cents" * 1.5)
  WHERE "spent_monthly_cents" > 0;
