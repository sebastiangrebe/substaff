#!/usr/bin/env bash
set -euo pipefail

# Creates a custom Blaxel sandbox template with Claude Code CLI + jq pre-installed.
# This eliminates the ~30-45s npm install on every agent run. Because Blaxel
# sandboxes are persistent and auto-suspend, this template only needs to be
# built once — subsequent runs resume the same sandbox in ~25ms.
#
# Prerequisites:
#   npm install -g @blaxel/cli
#   bl login
#
# Usage:
#   ./scripts/create-blaxel-template.sh
#
# After deployment, retrieve the image ID for your adapter config:
#   bl get sandboxes substaff-claude -ojson | jq -r '.[0].spec.runtime.image'

cd "$(dirname "$0")/../blaxel-template"

if ! command -v bl &>/dev/null; then
  echo "Error: bl CLI not found. Install with: npm install -g @blaxel/cli"
  exit 1
fi

echo "Building Blaxel sandbox template..."
make build

echo ""
echo "Deploying template to Blaxel..."
bl deploy

echo ""
echo "Done. Retrieve the image ID with:"
echo '  bl get sandboxes substaff-claude -ojson | jq -r '\''.[0].spec.runtime.image'\'''
echo ""
echo "Then set it in your agent's adapterConfig:"
echo '  { "image": "<image-id>", "model": "claude-sonnet-4-6", ... }'
