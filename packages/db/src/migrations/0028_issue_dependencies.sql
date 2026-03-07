CREATE TABLE IF NOT EXISTS "issue_dependencies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"issue_id" uuid NOT NULL,
	"depends_on_issue_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "issue_dependencies" ADD CONSTRAINT "issue_dependencies_issue_id_issues_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issues"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "issue_dependencies" ADD CONSTRAINT "issue_dependencies_depends_on_issue_id_issues_id_fk" FOREIGN KEY ("depends_on_issue_id") REFERENCES "public"."issues"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "issue_dependencies" ADD CONSTRAINT "issue_dependencies_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "issue_dependencies_pair_idx" ON "issue_dependencies" USING btree ("issue_id","depends_on_issue_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "issue_dependencies_issue_idx" ON "issue_dependencies" USING btree ("issue_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "issue_dependencies_depends_on_idx" ON "issue_dependencies" USING btree ("depends_on_issue_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "issue_dependencies_company_idx" ON "issue_dependencies" USING btree ("company_id");
