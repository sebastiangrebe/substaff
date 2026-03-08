-- MCP Server Definitions (global registry)
CREATE TABLE IF NOT EXISTS "mcp_server_definitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL UNIQUE,
	"display_name" text NOT NULL,
	"description" text NOT NULL,
	"icon_url" text,
	"mcp_package" text NOT NULL,
	"mcp_command" text NOT NULL,
	"mcp_args" text[] NOT NULL,
	"required_env_keys" text[] NOT NULL,
	"optional_env_keys" text[] NOT NULL DEFAULT '{}',
	"documentation_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
-- Extend integration_connections with MCP fields
ALTER TABLE "integration_connections" ADD COLUMN IF NOT EXISTS "mcp_server_definition_id" uuid;
--> statement-breakpoint
ALTER TABLE "integration_connections" ADD COLUMN IF NOT EXISTS "config" jsonb;
--> statement-breakpoint
ALTER TABLE "integration_connections" ADD COLUMN IF NOT EXISTS "status" text NOT NULL DEFAULT 'active';
--> statement-breakpoint
ALTER TABLE "integration_connections" ADD COLUMN IF NOT EXISTS "credential_secret_ids" jsonb;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "integration_connections" ADD CONSTRAINT "integration_connections_mcp_server_definition_id_mcp_server_definitions_id_fk" FOREIGN KEY ("mcp_server_definition_id") REFERENCES "public"."mcp_server_definitions"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "integration_connections_mcp_def_idx" ON "integration_connections" USING btree ("mcp_server_definition_id");
--> statement-breakpoint
-- Seed Day-1 MCP server definitions
INSERT INTO "mcp_server_definitions" ("slug", "display_name", "description", "mcp_package", "mcp_command", "mcp_args", "required_env_keys", "optional_env_keys")
VALUES
  ('github', 'GitHub', 'Push code, create PRs, manage issues, and collaborate on GitHub repositories.', '@modelcontextprotocol/server-github', 'npx', ARRAY['-y', '@modelcontextprotocol/server-github'], ARRAY['GITHUB_PERSONAL_ACCESS_TOKEN'], ARRAY[]::text[]),
  ('slack', 'Slack', 'Post messages, read channels, and interact with Slack workspaces.', '@modelcontextprotocol/server-slack', 'npx', ARRAY['-y', '@modelcontextprotocol/server-slack'], ARRAY['SLACK_BOT_TOKEN'], ARRAY[]::text[]),
  ('google-drive', 'Google Drive', 'Read, search, and manage files in Google Drive. Requires a one-time OAuth setup: create OAuth credentials in Google Cloud Console, run the auth flow locally, then paste the resulting credentials JSON here.', '@modelcontextprotocol/server-gdrive', 'npx', ARRAY['-y', '@modelcontextprotocol/server-gdrive'], ARRAY['GDRIVE_OAUTH_CREDENTIALS', 'GDRIVE_CREDENTIALS'], ARRAY[]::text[]),
  ('linear', 'Linear', 'Create and manage issues, projects, and cycles in Linear.', '@linearapp/linear-mcp-server', 'npx', ARRAY['-y', '@linearapp/linear-mcp-server'], ARRAY['LINEAR_API_KEY'], ARRAY[]::text[]),
  ('notion', 'Notion', 'Read and write pages, databases, and blocks in Notion.', '@notionhq/notion-mcp-server', 'npx', ARRAY['-y', '@notionhq/notion-mcp-server'], ARRAY['NOTION_API_KEY'], ARRAY[]::text[])
ON CONFLICT ("slug") DO NOTHING;
