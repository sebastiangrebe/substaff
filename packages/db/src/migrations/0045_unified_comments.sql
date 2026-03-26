-- Unify issue_comments and approval_comments into a single "comments" table
-- with link_type + link_id columns for polymorphic comment support.

-- 1. Rename the table
ALTER TABLE "issue_comments" RENAME TO "comments";

-- 2. Rename issue_id to link_id
ALTER TABLE "comments" RENAME COLUMN "issue_id" TO "link_id";

-- 3. Add link_type column with default 'issue' (so existing rows are correct)
ALTER TABLE "comments" ADD COLUMN "link_type" text NOT NULL DEFAULT 'issue';

-- 4. Drop the old FK constraint on issue_id (now link_id) since link_id is polymorphic
ALTER TABLE "comments" DROP CONSTRAINT IF EXISTS "issue_comments_issue_id_issues_id_fk";

-- 5. Drop old indexes and create new ones
DROP INDEX IF EXISTS "issue_comments_issue_idx";
DROP INDEX IF EXISTS "issue_comments_company_idx";
CREATE INDEX "comments_link_idx" ON "comments" ("link_type", "link_id");
CREATE INDEX "comments_company_idx" ON "comments" ("company_id");
CREATE INDEX "comments_link_created_idx" ON "comments" ("link_type", "link_id", "created_at");

-- 6. Migrate approval_comments into comments table
INSERT INTO "comments" ("id", "company_id", "link_type", "link_id", "author_agent_id", "author_user_id", "body", "created_at", "updated_at")
SELECT "id", "company_id", 'approval', "approval_id", "author_agent_id", "author_user_id", "body", "created_at", "updated_at"
FROM "approval_comments";

-- 7. Update issue_attachments FK to reference comments instead of issue_comments
ALTER TABLE "issue_attachments" DROP CONSTRAINT IF EXISTS "issue_attachments_issue_comment_id_issue_comments_id_fk";
ALTER TABLE "issue_attachments" ADD CONSTRAINT "issue_attachments_issue_comment_id_comments_id_fk"
  FOREIGN KEY ("issue_comment_id") REFERENCES "comments"("id") ON DELETE SET NULL;

-- 8. Drop the old approval_comments table
DROP TABLE "approval_comments";
