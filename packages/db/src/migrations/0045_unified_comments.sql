-- Unify issue_comments and approval_comments into a single "comments" table
-- with link_type + link_id columns for polymorphic comment support.

ALTER TABLE "issue_comments" RENAME TO "comments";
--> statement-breakpoint
ALTER TABLE "comments" RENAME COLUMN "issue_id" TO "link_id";
--> statement-breakpoint
ALTER TABLE "comments" ADD COLUMN "link_type" text NOT NULL DEFAULT 'issue';
--> statement-breakpoint
ALTER TABLE "comments" DROP CONSTRAINT IF EXISTS "issue_comments_issue_id_issues_id_fk";
--> statement-breakpoint
DROP INDEX IF EXISTS "issue_comments_issue_idx";
--> statement-breakpoint
DROP INDEX IF EXISTS "issue_comments_company_idx";
--> statement-breakpoint
CREATE INDEX "comments_link_idx" ON "comments" ("link_type", "link_id");
--> statement-breakpoint
CREATE INDEX "comments_company_idx" ON "comments" ("company_id");
--> statement-breakpoint
CREATE INDEX "comments_link_created_idx" ON "comments" ("link_type", "link_id", "created_at");
--> statement-breakpoint
INSERT INTO "comments" ("id", "company_id", "link_type", "link_id", "author_agent_id", "author_user_id", "body", "created_at", "updated_at")
SELECT "id", "company_id", 'approval', "approval_id", "author_agent_id", "author_user_id", "body", "created_at", "updated_at"
FROM "approval_comments";
--> statement-breakpoint
DROP TABLE "approval_comments";
