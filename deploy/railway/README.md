# Deploy Substaff to Railway

## One-Click Deploy

[![Deploy on Railway](https://railway.com/button.svg)](https://railway.com/template/substaff)

> Note: The template URL above becomes active after you publish the template on Railway (see below).

## Manual Deploy (5 minutes)

### 1. Prerequisites

- A [Railway](https://railway.com) account (Hobby plan: $5/mo)
- A [Cloudflare](https://dash.cloudflare.com) account (free) for R2 object storage
- An [Anthropic API key](https://console.anthropic.com) for AI agents

### 2. Create Project

```bash
# Install Railway CLI
npm i -g @railway/cli

# Login
railway login

# Initialize project from this repo
railway init

# Link to your repo
railway link
```

### 3. Add Services

```bash
# Add PostgreSQL
railway add --plugin postgresql

# Add Redis
railway add --plugin redis
```

### 4. Set Environment Variables

```bash
# Run the setup script (interactive)
./deploy/railway/setup.sh
```

Or set manually:

```bash
railway variables set \
  BETTER_AUTH_SECRET=$(openssl rand -hex 32) \
  SUBSTAFF_AGENT_JWT_SECRET=$(openssl rand -hex 32) \
  SERVE_UI=true \
  SUBSTAFF_DEPLOYMENT_MODE=authenticated \
  SUBSTAFF_MIGRATION_AUTO_APPLY=true \
  HEARTBEAT_SCHEDULER_ENABLED=true \
  MANAGED_ANTHROPIC_API_KEY=sk-ant-your-key
```

### 5. Set Up Cloudflare R2

1. Go to Cloudflare Dashboard → R2 → Create Bucket → name it `substaff`
2. Create an API token (R2 read/write)
3. Set the variables:

```bash
railway variables set \
  SUBSTAFF_STORAGE_S3_BUCKET=substaff \
  SUBSTAFF_STORAGE_S3_REGION=auto \
  SUBSTAFF_STORAGE_S3_ENDPOINT=https://YOUR_ACCOUNT_ID.r2.cloudflarestorage.com \
  SUBSTAFF_STORAGE_S3_FORCE_PATH_STYLE=true \
  AWS_ACCESS_KEY_ID=your-r2-access-key \
  AWS_SECRET_ACCESS_KEY=your-r2-secret-key
```

### 6. Deploy

```bash
railway up
```

### 7. Get Your URL

```bash
railway domain
```

Then set the public URL:

```bash
railway variables set \
  APP_URL=https://your-app.up.railway.app \
  SUBSTAFF_AUTH_PUBLIC_BASE_URL=https://your-app.up.railway.app \
  SUBSTAFF_EXTERNAL_API_URL=https://your-app.up.railway.app
```

## Creating the Railway Template

To publish as a one-click template:

1. Deploy the project manually first (steps above)
2. Go to Railway Dashboard → your project → Settings → "Create Template"
3. Configure the template variables (mark secrets as `secret()`)
4. Publish

## Optional Services

After initial deploy, you can add:

- **Stripe** billing: Set `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET`
- **Resend** email: Set `RESEND_API_KEY` and `EMAIL_FROM`
- **E2B** sandboxes: Set `E2B_API_KEY`
- **Qdrant** vector search: Set `QDRANT_URL` and `QDRANT_API_KEY`
