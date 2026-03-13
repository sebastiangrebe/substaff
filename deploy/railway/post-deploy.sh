#!/usr/bin/env bash
set -euo pipefail

# Run after first deploy to set public URL variables
# Usage: ./deploy/railway/post-deploy.sh [custom-domain]

if ! command -v railway &> /dev/null; then
  echo "Error: Railway CLI not found. Install with: npm i -g @railway/cli"
  exit 1
fi

if [ -n "${1:-}" ]; then
  APP_URL="https://$1"
  echo "Using custom domain: $APP_URL"
else
  echo "Fetching Railway domain..."
  DOMAIN=$(railway domain 2>/dev/null | grep -oE '[a-z0-9-]+\.up\.railway\.app' | head -1)
  if [ -z "$DOMAIN" ]; then
    echo "No domain found. Generating one..."
    railway domain
    DOMAIN=$(railway domain 2>/dev/null | grep -oE '[a-z0-9-]+\.up\.railway\.app' | head -1)
  fi
  APP_URL="https://$DOMAIN"
  echo "Detected domain: $APP_URL"
fi

echo "Setting public URL variables..."
railway variables set \
  APP_URL="$APP_URL" \
  SUBSTAFF_AUTH_PUBLIC_BASE_URL="$APP_URL" \
  SUBSTAFF_EXTERNAL_API_URL="$APP_URL"

echo ""
echo "Done! Your app is live at: $APP_URL"
echo ""
echo "If using Stripe, set your webhook URL to:"
echo "  $APP_URL/api/webhooks/stripe"
