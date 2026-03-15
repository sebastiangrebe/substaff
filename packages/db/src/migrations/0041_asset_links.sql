-- Asset links: generic many-to-many linking of assets to entities (issues, projects, goals, comments)
CREATE TABLE IF NOT EXISTS "asset_links" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid NOT NULL REFERENCES "companies"("id"),
  "asset_id" uuid NOT NULL REFERENCES "assets"("id") ON DELETE CASCADE,
  "link_type" text NOT NULL,
  "link_id" uuid NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX "asset_links_company_link_idx" ON "asset_links" ("company_id", "link_type", "link_id");
CREATE UNIQUE INDEX "asset_links_asset_link_uq" ON "asset_links" ("asset_id", "link_type", "link_id");

-- Drop the old issue_attachments table
DROP TABLE IF EXISTS "issue_attachments";
