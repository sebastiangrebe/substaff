CREATE TABLE IF NOT EXISTS "company_roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"display_label" text NOT NULL,
	"description" text,
	"classification" text DEFAULT 'ic' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

DO $$ BEGIN
 ALTER TABLE "company_roles" ADD CONSTRAINT "company_roles_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

CREATE INDEX IF NOT EXISTS "company_roles_company_idx" ON "company_roles" USING btree ("company_id");
CREATE UNIQUE INDEX IF NOT EXISTS "company_roles_company_slug_idx" ON "company_roles" USING btree ("company_id","slug");
