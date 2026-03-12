-- Migration: Replace custom MCP integration system with Composio
-- Drop the mcp_server_definitions table (Composio hosts all definitions)
DROP TABLE IF EXISTS "mcp_server_definitions" CASCADE;

-- Simplify integration_connections: remove old credential/MCP columns, add Composio reference
ALTER TABLE "integration_connections"
  DROP COLUMN IF EXISTS "access_token",
  DROP COLUMN IF EXISTS "refresh_token",
  DROP COLUMN IF EXISTS "scopes",
  DROP COLUMN IF EXISTS "expires_at",
  DROP COLUMN IF EXISTS "mcp_server_definition_id",
  DROP COLUMN IF EXISTS "credential_secret_ids",
  ADD COLUMN IF NOT EXISTS "composio_connected_account_id" text;

-- Drop the old MCP definition index
DROP INDEX IF EXISTS "integration_connections_mcp_def_idx";
