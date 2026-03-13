#!/usr/bin/env bash
set -euo pipefail

# Substaff Railway Setup Script
# Run this after `railway init` and `railway link`

echo "=== Substaff Railway Setup ==="
echo ""

# Check railway CLI is installed
if ! command -v railway &> /dev/null; then
  echo "Error: Railway CLI not found. Install with: npm i -g @railway/cli"
  exit 1
fi

# Check we're linked to a project
if ! railway status &> /dev/null; then
  echo "Error: Not linked to a Railway project. Run 'railway init' first."
  exit 1
fi

echo "Step 1/5: Adding PostgreSQL..."
railway add --plugin postgresql 2>/dev/null || echo "  PostgreSQL may already exist, skipping."

echo "Step 2/5: Adding Redis..."
railway add --plugin redis 2>/dev/null || echo "  Redis may already exist, skipping."

echo "Step 3/5: Generating auth secrets..."
AUTH_SECRET=$(openssl rand -hex 32)
JWT_SECRET=$(openssl rand -hex 32)

echo "Step 4/5: Setting core environment variables..."
railway variables set \
  BETTER_AUTH_SECRET="$AUTH_SECRET" \
  SUBSTAFF_AGENT_JWT_SECRET="$JWT_SECRET" \
  HOST=0.0.0.0 \
  PORT=3100 \
  SERVE_UI=true \
  NODE_ENV=production \
  SUBSTAFF_DEPLOYMENT_MODE=authenticated \
  SUBSTAFF_MIGRATION_AUTO_APPLY=true \
  SUBSTAFF_MIGRATION_PROMPT=never \
  HEARTBEAT_SCHEDULER_ENABLED=true \
  HEARTBEAT_SCHEDULER_INTERVAL_MS=30000 \
  SUBSTAFF_OPEN_ON_LISTEN=false

echo ""
echo "Step 5/5: Collecting your API keys..."
echo ""

# Anthropic API Key
read -rp "Anthropic API key (sk-ant-...): " ANTHROPIC_KEY
if [ -n "$ANTHROPIC_KEY" ]; then
  railway variables set \
    MANAGED_ANTHROPIC_API_KEY="$ANTHROPIC_KEY" \
    ANTHROPIC_API_KEY="$ANTHROPIC_KEY"
fi

# Cloudflare R2
echo ""
echo "--- Cloudflare R2 Storage Setup ---"
read -rp "Cloudflare Account ID: " CF_ACCOUNT_ID
read -rp "R2 Access Key ID: " R2_ACCESS_KEY
read -rp "R2 Secret Access Key: " R2_SECRET_KEY
R2_BUCKET="${R2_BUCKET:-substaff}"

if [ -n "$CF_ACCOUNT_ID" ] && [ -n "$R2_ACCESS_KEY" ]; then
  railway variables set \
    SUBSTAFF_STORAGE_S3_BUCKET="$R2_BUCKET" \
    SUBSTAFF_STORAGE_S3_REGION=auto \
    SUBSTAFF_STORAGE_S3_ENDPOINT="https://${CF_ACCOUNT_ID}.r2.cloudflarestorage.com" \
    SUBSTAFF_STORAGE_S3_FORCE_PATH_STYLE=true \
    AWS_ACCESS_KEY_ID="$R2_ACCESS_KEY" \
    AWS_SECRET_ACCESS_KEY="$R2_SECRET_KEY"
fi

# Optional: Stripe
echo ""
read -rp "Stripe Secret Key (optional, press Enter to skip): " STRIPE_KEY
if [ -n "$STRIPE_KEY" ]; then
  read -rp "Stripe Webhook Secret: " STRIPE_WH
  railway variables set \
    STRIPE_SECRET_KEY="$STRIPE_KEY" \
    STRIPE_WEBHOOK_SECRET="$STRIPE_WH"
fi

# Optional: Resend
read -rp "Resend API Key (optional, press Enter to skip): " RESEND_KEY
if [ -n "$RESEND_KEY" ]; then
  read -rp "Email From (e.g. Substaff <noreply@example.com>): " EMAIL_FROM
  railway variables set \
    RESEND_API_KEY="$RESEND_KEY" \
    EMAIL_FROM="$EMAIL_FROM"
fi

# Optional: E2B
read -rp "E2B API Key (optional, press Enter to skip): " E2B_KEY
if [ -n "$E2B_KEY" ]; then
  railway variables set E2B_API_KEY="$E2B_KEY"
fi

echo ""
echo "=== Setup Complete ==="
echo ""
echo "Next steps:"
echo "  1. Deploy:        railway up"
echo "  2. Get your URL:  railway domain"
echo "  3. Set public URL:"
echo "     railway variables set APP_URL=https://YOUR_URL SUBSTAFF_AUTH_PUBLIC_BASE_URL=https://YOUR_URL SUBSTAFF_EXTERNAL_API_URL=https://YOUR_URL"
echo ""
echo "Your app will be live at port 3100. Railway will auto-assign a public domain."
