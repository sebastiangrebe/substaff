-- Social Media Integrations: Meta (Facebook, Instagram & WhatsApp) + TikTok
INSERT INTO "mcp_server_definitions" ("slug", "display_name", "description", "mcp_package", "mcp_command", "mcp_args", "required_env_keys", "optional_env_keys")
VALUES
  ('meta', 'Meta (Facebook, Instagram & WhatsApp)', 'Manage Meta ad campaigns, creatives, audiences, and analytics across Facebook, Instagram, and WhatsApp.', 'meta-ads-mcp', 'npx', ARRAY['-y', 'meta-ads-mcp'], ARRAY['META_ACCESS_TOKEN'], ARRAY[]::text[]),
  ('tiktok', 'TikTok', 'Publish videos and photos, manage content, and track analytics on TikTok.', '@substaff/mcp-tiktok', 'npx', ARRAY['-y', '@substaff/mcp-tiktok'], ARRAY['TIKTOK_ACCESS_TOKEN'], ARRAY[]::text[])
ON CONFLICT ("slug") DO NOTHING;
