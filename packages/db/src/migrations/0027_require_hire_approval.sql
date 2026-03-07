ALTER TABLE "companies" ADD COLUMN "require_hire_approval" boolean DEFAULT true NOT NULL;
ALTER TABLE "companies" ALTER COLUMN "require_plan_approval" SET DEFAULT true;
