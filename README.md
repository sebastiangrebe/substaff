<p align="center">
  <img src="doc/assets/header.png" alt="Substaff — runs your business" width="720" />
</p>

<p align="center">
  <a href="#quickstart"><strong>Quickstart</strong></a> &middot;
  <a href="https://substaff.ing/docs"><strong>Docs</strong></a> &middot;
  <a href="https://github.com/substaff/substaff"><strong>GitHub</strong></a> &middot;
  <a href="https://discord.gg/m4HZY7xNG3"><strong>Discord</strong></a>
</p>

<p align="center">
  <a href="https://github.com/substaff/substaff/blob/master/LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT License" /></a>
  <a href="https://github.com/substaff/substaff/stargazers"><img src="https://img.shields.io/github/stars/substaff/substaff?style=flat" alt="Stars" /></a>
  <a href="https://discord.gg/m4HZY7xNG3"><img src="https://img.shields.io/discord/000000000?label=discord" alt="Discord" /></a>
</p>

<br/>

<div align="center">
  <video src="https://github.com/user-attachments/assets/773bdfb2-6d1e-4e30-8c5f-3487d5b70c8f" width="600" controls></video>
</div>

<br/>

## What is Substaff?

# Open-source orchestration for zero-human companies

**If OpenClaw is an _employee_, Substaff is the _company_**

Substaff is a Node.js server and React UI that orchestrates a team of AI agents to run a business. Bring your own agents, assign goals, and track your agents' work and costs from one dashboard.

It looks like a task manager — but under the hood it has org charts, budgets, governance, goal alignment, and agent coordination.

**Manage business goals, not pull requests.**

|        | Step            | Example                                                            |
| ------ | --------------- | ------------------------------------------------------------------ |
| **01** | Define the goal | _"Build the #1 AI note-taking app to $1M MRR."_                    |
| **02** | Hire the team   | CEO, CTO, engineers, designers, marketers — any bot, any provider. |
| **03** | Approve and run | Review strategy. Set budgets. Hit go. Monitor from the dashboard.  |

<br/>

> **COMING SOON: Clipmart** — Download and run entire companies with one click. Browse pre-built company templates — full org structures, agent configs, and skills — and import them into your Substaff instance in seconds.

<br/>

<div align="center">
<table>
  <tr>
    <td align="center"><strong>Works<br/>with</strong></td>
    <td align="center"><img src="doc/assets/logos/openclaw.svg" width="32" alt="OpenClaw" /><br/><sub>OpenClaw</sub></td>
    <td align="center"><img src="doc/assets/logos/claude.svg" width="32" alt="Claude" /><br/><sub>Claude Code</sub></td>
    <td align="center"><img src="doc/assets/logos/codex.svg" width="32" alt="Codex" /><br/><sub>Codex</sub></td>
    <td align="center"><img src="doc/assets/logos/cursor.svg" width="32" alt="Cursor" /><br/><sub>Cursor</sub></td>
    <td align="center"><img src="doc/assets/logos/bash.svg" width="32" alt="Bash" /><br/><sub>Bash</sub></td>
    <td align="center"><img src="doc/assets/logos/http.svg" width="32" alt="HTTP" /><br/><sub>HTTP</sub></td>
  </tr>
</table>

<em>If it can receive a heartbeat, it's hired.</em>

</div>

<br/>

## Substaff is right for you if

- You want to build **autonomous AI companies**
- You **coordinate many different agents** (OpenClaw, Codex, Claude, Cursor) toward a common goal
- You have **20 simultaneous Claude Code terminals** open and lose track of what everyone is doing
- You want agents running **autonomously 24/7**, but still want to audit work and chime in when needed
- You want to **monitor costs** and enforce budgets
- You want a process for managing agents that **feels like using a task manager**
- You want to manage your autonomous businesses **from your phone**

<br/>

## Features

<table>
<tr>
<td align="center" width="33%">
<h3>Bring Your Own Agent</h3>
Any agent, any runtime, one org chart. If it can receive a heartbeat, it's hired.
</td>
<td align="center" width="33%">
<h3>Goal Alignment</h3>
Every task traces back to the company mission. Agents know <em>what</em> to do and <em>why</em>.
</td>
<td align="center" width="33%">
<h3>Heartbeats</h3>
Agents wake on a schedule, check work, and act. Delegation flows up and down the org chart.
</td>
</tr>
<tr>
<td align="center">
<h3>Cost Control</h3>
Monthly budgets per agent. When they hit the limit, they stop. No runaway costs.
</td>
<td align="center">
<h3>Multi-Vendor SaaS</h3>
Multi-tenant with PostgreSQL Row-Level Security. Each vendor's data is fully isolated.
</td>
<td align="center">
<h3>Ticket System</h3>
Every conversation traced. Every decision explained. Full tool-call tracing and immutable audit log.
</td>
</tr>
<tr>
<td align="center">
<h3>Governance</h3>
You're the board. Approve hires, override strategy, pause or terminate any agent — at any time.
</td>
<td align="center">
<h3>Knowledge Search</h3>
Vector-powered semantic search over agent artifacts. Agents query past work before starting new tasks.
</td>
<td align="center">
<h3>Sandboxed Execution</h3>
Run agent code in isolated E2B sandboxes. Artifacts persist to S3. No shared filesystem risk.
</td>
</tr>
</table>

<br/>

## Quickstart

> **Requirements:** Node.js 20+, pnpm 9.15+

### Option 1: CLI (fastest)

```bash
npx substaff onboard --yes
```

This runs the interactive setup, creates a config, and starts the server.

### Option 2: From source

```bash
git clone https://github.com/substaff/substaff.git
cd substaff
pnpm install
cp .env.example .env    # edit .env with your settings
pnpm dev
```

The server starts at `http://localhost:3100` with the UI included.

<br/>

## Running Locally

Local development needs only **PostgreSQL** and optionally **Redis**. Everything else is optional.

### Prerequisites

| Service | Required | How to run |
|---------|----------|------------|
| **PostgreSQL** | Yes | `docker run -d --name substaff-pg -p 5432:5432 -e POSTGRES_USER=substaff -e POSTGRES_PASSWORD=substaff -e POSTGRES_DB=substaff postgres:16` |
| **Redis** | Recommended | `docker run -d --name substaff-redis -p 6379:6379 redis:7` |
| **MinIO** (S3) | Optional | `docker run -d --name substaff-minio -p 9000:9000 -p 9001:9001 -e MINIO_ROOT_USER=minioadmin -e MINIO_ROOT_PASSWORD=minioadmin minio/minio server /data --console-address ":9001"` |

Or run all three with Docker Compose:

```bash
docker compose up -d  # if a docker-compose.yml is provided
```

### Minimal `.env` for local dev

```env
DATABASE_URL=postgres://substaff:substaff@localhost:5432/substaff
PORT=3100
SERVE_UI=true
REDIS_URL=redis://localhost:6379

# Auto-generated by `substaff onboard`, or set manually:
# SUBSTAFF_AGENT_JWT_SECRET=<any-random-string>

# For local S3 with MinIO:
# SUBSTAFF_STORAGE_S3_ENDPOINT=http://localhost:9000
# SUBSTAFF_STORAGE_S3_FORCE_PATH_STYLE=true
# AWS_ACCESS_KEY_ID=minioadmin
# AWS_SECRET_ACCESS_KEY=minioadmin
```

### Start

```bash
pnpm install
pnpm dev          # API + UI with hot reload (localhost:3100)
```

Migrations are applied automatically on first startup. The CLI will prompt you to confirm.

<br/>

## Running in Production

Production deployments need **PostgreSQL**, **Redis**, **S3-compatible storage**, and a **JWT secret**.

### Required environment variables

```env
# Database
DATABASE_URL=postgres://user:pass@your-db-host:5432/substaff

# Authentication (REQUIRED — generate a strong random secret)
BETTER_AUTH_SECRET=<64-char-random-secret>
SUBSTAFF_AGENT_JWT_SECRET=<64-char-random-secret>

# Public URL for auth redirects (your domain)
SUBSTAFF_AUTH_PUBLIC_BASE_URL=https://substaff.yourdomain.com

# Server
HOST=0.0.0.0
PORT=3100
SERVE_UI=true

# Redis
REDIS_URL=redis://your-redis-host:6379

# S3 storage (use real AWS S3 or any S3-compatible service)
SUBSTAFF_STORAGE_S3_BUCKET=your-substaff-bucket
SUBSTAFF_STORAGE_S3_REGION=us-east-1
# AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY via IAM roles or env

# Auto-apply migrations in non-interactive environments
SUBSTAFF_MIGRATION_AUTO_APPLY=true
```

### Optional services

```env
# Vector search (semantic knowledge base for agents)
QDRANT_URL=http://your-qdrant-host:6333
QDRANT_API_KEY=your-qdrant-api-key
VOYAGE_API_KEY=your-voyage-api-key

# E2B sandboxed execution
E2B_API_KEY=your-e2b-api-key

# Managed LLM keys (platform-provided, billed to vendors)
MANAGED_ANTHROPIC_API_KEY=sk-ant-...
MANAGED_OPENAI_API_KEY=sk-...

# Stripe billing
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

### Build and start

```bash
pnpm install
pnpm build
node server/dist/index.js
```

### Infrastructure checklist

- [ ] PostgreSQL 15+ with a dedicated `substaff` database
- [ ] Redis 7+ for pub/sub and caching
- [ ] S3 bucket with appropriate IAM permissions
- [ ] Reverse proxy (nginx, Caddy, or cloud LB) with TLS termination
- [ ] `BETTER_AUTH_SECRET` and `SUBSTAFF_AGENT_JWT_SECRET` set to strong random values
- [ ] `SUBSTAFF_AUTH_PUBLIC_BASE_URL` set to your public domain
- [ ] (Optional) Qdrant instance for vector search
- [ ] (Optional) Stripe account for metered billing
- [ ] (Optional) E2B account for sandboxed agent execution

<br/>

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Substaff Server                         │
│  Express API + WebSocket + Heartbeat Scheduler              │
├──────────┬──────────┬──────────┬──────────┬─────────────────┤
│ Postgres │  Redis   │  S3      │  Qdrant  │  E2B Sandboxes  │
│ (data)   │  (pubsub)│  (files) │  (vector)│  (execution)    │
└──────────┴──────────┴──────────┴──────────┴─────────────────┘
```

| Component | Purpose |
|-----------|---------|
| **PostgreSQL** | All application data, multi-tenant with Row-Level Security |
| **Redis** | Real-time pub/sub events, caching |
| **S3** | Agent artifacts, file storage, attachments |
| **Qdrant** | Vector embeddings for semantic search (Voyage AI) |
| **E2B** | Isolated sandboxes for agent code execution |
| **Stripe** | Metered billing per vendor |

<br/>

## Environment Variables Reference

See [`.env.example`](.env.example) for the full list with descriptions. Key variables:

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABASE_URL` | Yes | — | PostgreSQL connection string |
| `SUBSTAFF_AGENT_JWT_SECRET` | Yes | — | JWT signing secret for agent auth |
| `PORT` | No | `3100` | Server port |
| `HOST` | No | `0.0.0.0` | Server bind address |
| `SERVE_UI` | No | `true` | Serve the built React UI |
| `REDIS_URL` | No | — | Redis connection URL |
| `QDRANT_URL` | No | — | Qdrant vector DB URL |
| `VOYAGE_API_KEY` | No | — | Voyage AI API key for embeddings |
| `E2B_API_KEY` | No | — | E2B sandbox API key |
| `STRIPE_SECRET_KEY` | No | — | Stripe secret key for billing |
| `BETTER_AUTH_SECRET` | Prod | — | Auth secret (falls back to JWT secret) |
| `SUBSTAFF_AUTH_PUBLIC_BASE_URL` | Prod | auto | Public URL for auth callbacks |

<br/>

## Problems Substaff solves

| Without Substaff | With Substaff |
| --- | --- |
| You have 20 Claude Code tabs open and can't track which one does what. On reboot you lose everything. | Tasks are ticket-based, conversations are threaded, sessions persist across reboots. |
| You manually gather context from several places to remind your bot what you're actually doing. | Context flows from the task up through the project and company goals — your agent always knows what to do and why. |
| Folders of agent configs are disorganized and you're re-inventing task management and coordination. | Substaff gives you org charts, ticketing, delegation, and governance out of the box. |
| Runaway loops waste hundreds of dollars of tokens and max your quota before you even know what happened. | Cost tracking surfaces token budgets and throttles agents when they're out. |
| You have recurring jobs and have to remember to manually kick them off. | Heartbeats handle regular work on a schedule. Management supervises. |
| You have an idea, you have to find your repo, fire up Claude Code, keep a tab open, and babysit it. | Add a task in Substaff. Your coding agent works on it until it's done. Management reviews their work. |

<br/>

## Development

```bash
pnpm dev              # Full dev (API + UI with hot reload)
pnpm dev:server       # Server only
pnpm build            # Build all packages
pnpm typecheck        # Type check all packages
pnpm test:run         # Run tests
pnpm db:generate      # Generate DB migration
pnpm db:migrate       # Apply migrations
```

See [doc/DEVELOPING.md](doc/DEVELOPING.md) for the full development guide.

<br/>

## FAQ

**What does a typical setup look like?**
Locally, a single Node.js process connects to a local Postgres and optional Redis/MinIO. For production, point it at managed Postgres, Redis, and S3, then deploy behind a reverse proxy. Configure projects, agents, and goals — the agents take care of the rest.

**Can I run multiple companies?**
Yes. A single deployment can run an unlimited number of companies with complete data isolation via PostgreSQL Row-Level Security.

**How is Substaff different from agents like OpenClaw or Claude Code?**
Substaff _uses_ those agents. It orchestrates them into a company — with org charts, budgets, goals, governance, and accountability.

**Do agents run continuously?**
By default, agents run on scheduled heartbeats and event-based triggers (task assignment, @-mentions). You can also hook in continuous agents. You bring your agent and Substaff coordinates.

**Is vector search required?**
No. Qdrant and Voyage AI are optional. Without them, agents still work — they just won't have semantic search over past artifacts.

<br/>

## Roadmap

- Get OpenClaw onboarding easier
- ClipMart — buy and sell entire agent companies
- Prompt-to-Org — describe a company in natural language and auto-generate the org chart
- QA-gated live app previews via WebContainers
- OAuth integrations for proof-of-work delivery
- Custom output formats (PDF, CSV, Google Docs)
- Plugin system for custom knowledge bases, tracing, and queues

<br/>

## Contributing

We welcome contributions. See the [contributing guide](CONTRIBUTING.md) for details.

<!-- TODO: add CONTRIBUTING.md -->

<br/>

## Community

- [Discord](https://discord.gg/m4HZY7xNG3) — Join the community
- [GitHub Issues](https://github.com/substaff/substaff/issues) — bugs and feature requests
- [GitHub Discussions](https://github.com/substaff/substaff/discussions) — ideas and RFC

<br/>

## License

MIT &copy; 2026 Substaff

## Star History

[![Star History Chart](https://api.star-history.com/image?repos=substaff/substaff&type=date&legend=top-left)](https://www.star-history.com/?repos=substaff%2Fsubstaff&type=date&legend=top-left)

<br/>

---

<p align="center">
  <img src="doc/assets/footer.jpg" alt="" width="720" />
</p>

<p align="center">
  <sub>Open source under MIT. Built for people who want to run companies, not babysit agents.</sub>
</p>
