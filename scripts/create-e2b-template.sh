#!/usr/bin/env bash
set -euo pipefail

# Creates a custom E2B sandbox template with Claude Code CLI + jq pre-installed.
# This eliminates the ~30-45s npm install on every agent run.
#
# Prerequisites:
#   npm install -g @e2b/cli
#   e2b auth login
#
# Usage:
#   ./scripts/create-e2b-template.sh
#
# After creation, update your agent adapterConfig to use the new template:
#   { "template": "<template-id>", ... }

cd "$(dirname "$0")/.."

if ! command -v e2b &>/dev/null; then
  echo "Error: e2b CLI not found. Install with: npm install -g @e2b/cli"
  exit 1
fi

echo "Building E2B sandbox template from e2b.Dockerfile..."
e2b template build --dockerfile e2b.Dockerfile --name "substaff-claude"

echo ""
echo "Done. Copy the template ID above and set it in your agent's adapterConfig:"
echo '  { "template": "<template-id>", "model": "claude-sonnet-4-20250514", ... }'
