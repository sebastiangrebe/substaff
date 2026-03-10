-- Billing & Credits: add vendor billing columns, platform cost tracking, and credit transactions audit trail

-- Vendor billing columns
ALTER TABLE "vendors" ADD COLUMN "credit_balance_cents" integer NOT NULL DEFAULT 0;
ALTER TABLE "vendors" ADD COLUMN "markup_basis_points" integer NOT NULL DEFAULT 15000;
ALTER TABLE "vendors" ADD COLUMN "low_balance_alert_cents" integer NOT NULL DEFAULT 500;
ALTER TABLE "vendors" ADD COLUMN "last_low_balance_alert_at" timestamp with time zone;

-- Platform cost on cost events
ALTER TABLE "cost_events" ADD COLUMN "platform_cost_cents" integer NOT NULL DEFAULT 0;

-- Credit transactions audit trail
CREATE TABLE IF NOT EXISTS "credit_transactions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "vendor_id" uuid NOT NULL REFERENCES "vendors"("id") ON DELETE CASCADE,
  "type" text NOT NULL,
  "amount_cents" integer NOT NULL,
  "balance_after_cents" integer NOT NULL,
  "stripe_session_id" text,
  "cost_event_id" uuid REFERENCES "cost_events"("id"),
  "description" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX "credit_tx_vendor_created_idx" ON "credit_transactions" ("vendor_id", "created_at");
CREATE INDEX "credit_tx_stripe_session_idx" ON "credit_transactions" ("stripe_session_id");
