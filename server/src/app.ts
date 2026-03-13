import express, { Router, type Request as ExpressRequest } from "express";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import type { Db } from "@substaff/db";
import { authUsers } from "@substaff/db";
import { eq, sql } from "drizzle-orm";
import type { DeploymentMode } from "@substaff/shared";
import type { StorageService } from "./storage/types.js";
import { httpLogger, errorHandler } from "./middleware/index.js";
import { actorMiddleware } from "./middleware/auth.js";
import { rlsContextMiddleware } from "./middleware/rls-context.js";
import { boardMutationGuard } from "./middleware/board-mutation-guard.js";
import { healthRoutes } from "./routes/health.js";
import { companyRoutes } from "./routes/companies.js";
import { agentRoutes } from "./routes/agents.js";
import { projectRoutes } from "./routes/projects.js";
import { issueRoutes } from "./routes/issues.js";
import { goalRoutes } from "./routes/goals.js";
import { approvalRoutes } from "./routes/approvals.js";
import { secretRoutes } from "./routes/secrets.js";
import { costRoutes } from "./routes/costs.js";
import { activityRoutes } from "./routes/activity.js";
import { dashboardRoutes } from "./routes/dashboard.js";
import { sidebarBadgeRoutes } from "./routes/sidebar-badges.js";
import { llmRoutes } from "./routes/llms.js";
import { assetRoutes } from "./routes/assets.js";
import { accessRoutes } from "./routes/access.js";
import { vendorRoutes } from "./routes/vendors.js";
import { billingRoutes } from "./routes/billing.js";
import { stripeService } from "./services/stripe.js";
import { logger as webhookLogger } from "./middleware/logger.js";
import { planRoutes } from "./routes/plans.js";
import { templateRoutes } from "./routes/templates.js";
import { fileRoutes } from "./routes/files.js";
import { knowledgeRoutes } from "./routes/knowledge.js";
import { projectStateRoutes } from "./routes/project-state.js";
import { integrationRoutes } from "./routes/integrations.js";
import { companyRoleRoutes } from "./routes/company-roles.js";
import { chatRoutes } from "./routes/chat.js";
import { avatarRoutes } from "./routes/avatar.js";
import type { BetterAuthSessionResult } from "./auth/better-auth.js";

type UiMode = "none" | "static" | "vite-dev";

export async function createApp(
  db: Db,
  opts: {
    uiMode: UiMode;
    storageService: StorageService;
    deploymentMode: DeploymentMode;
    authReady: boolean;
    companyDeletionEnabled: boolean;
    maxSignupUsers?: number;
    betterAuthHandler?: express.RequestHandler;
    resolveSession?: (req: ExpressRequest) => Promise<BetterAuthSessionResult | null>;
  },
) {
  const app = express();

  // Stripe webhook must be mounted before any body parsers or auth middleware
  // because it needs the raw body for signature verification.
  {
    const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
    const stripeWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (stripeSecretKey && stripeWebhookSecret) {
      app.post(
        "/api/webhooks/stripe",
        express.raw({ type: "application/json" }),
        async (req, res) => {
          const sig = req.headers["stripe-signature"];
          if (!sig) {
            res.status(400).json({ error: "Missing stripe-signature header" });
            return;
          }
          try {
            const Stripe = (await import("stripe")).default;
            const stripe = new Stripe(stripeSecretKey, { apiVersion: "2025-01-27.acacia" as any });
            const event = stripe.webhooks.constructEvent(req.body, sig as string, stripeWebhookSecret);
            await stripeService(db).handleWebhookEvent(event);
            res.json({ received: true });
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            webhookLogger.warn({ err }, "Stripe webhook verification failed");
            res.status(400).json({ error: `Webhook Error: ${message}` });
          }
        },
      );
    }
  }

  app.use(express.json());
  app.use(httpLogger);
  app.use(
    actorMiddleware(db, {
      resolveSession: opts.resolveSession,
    }),
  );
  app.use(rlsContextMiddleware(db));
  app.get("/api/auth/get-session", async (req, res) => {
    if (req.actor.type !== "board" || !req.actor.userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const userRow = await db
      .select({ name: authUsers.name, email: authUsers.email, image: authUsers.image })
      .from(authUsers)
      .where(eq(authUsers.id, req.actor.userId))
      .then((rows) => rows[0] ?? null);
    res.json({
      session: {
        id: `substaff:${req.actor.source}:${req.actor.userId}`,
        userId: req.actor.userId,
      },
      user: {
        id: req.actor.userId,
        email: userRow?.email ?? null,
        name: userRow?.name ?? null,
        image: userRow?.image ?? null,
      },
    });
  });
  app.use("/api", avatarRoutes(db, opts.storageService));
  if (opts.betterAuthHandler) {
    if (opts.maxSignupUsers != null) {
      const maxUsers = opts.maxSignupUsers;
      app.post("/api/auth/sign-up/email", async (req, res, next) => {
        const [{ count: userCount }] = await db
          .select({ count: sql<number>`count(*)` })
          .from(authUsers);
        if (userCount >= maxUsers) {
          res.status(403).json({ error: { message: "Sign-ups are currently closed. Maximum number of users has been reached." } });
          return;
        }
        next();
      });
    }
    app.all("/api/auth/*authPath", opts.betterAuthHandler);
  }
  app.use(llmRoutes(db));

  // Mount API routes
  const api = Router();
  api.use(boardMutationGuard());
  api.use(
    "/health",
    healthRoutes(db, {
      deploymentMode: opts.deploymentMode,
      authReady: opts.authReady,
      companyDeletionEnabled: opts.companyDeletionEnabled,
    }),
  );
  api.use("/companies", companyRoutes(db));
  api.use(agentRoutes(db));
  api.use(assetRoutes(db, opts.storageService));
  api.use(projectRoutes(db));
  api.use(issueRoutes(db, opts.storageService));
  api.use(goalRoutes(db));
  api.use(approvalRoutes(db));
  api.use(secretRoutes(db));
  api.use(costRoutes(db));
  api.use(activityRoutes(db));
  api.use(dashboardRoutes(db));
  api.use(sidebarBadgeRoutes(db));
  api.use(
    accessRoutes(db, {
      deploymentMode: opts.deploymentMode,
    }),
  );
  api.use(vendorRoutes(db));
  api.use(billingRoutes(db));
  api.use(planRoutes(db));
  api.use(templateRoutes(db));
  api.use(fileRoutes(opts.storageService));
  api.use(knowledgeRoutes(db));
  api.use(integrationRoutes(db));
  api.use(companyRoleRoutes(db));
  api.use("/companies", projectStateRoutes(db));
  api.use(chatRoutes(db));
  api.use((_req, res) => {
    res.status(404).json({ error: "Not found" });
  });
  app.use("/api", api);

  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  if (opts.uiMode === "static") {
    // Try published location first (server/ui-dist/), then monorepo dev location (../../ui/dist)
    const candidates = [
      path.resolve(__dirname, "../ui-dist"),
      path.resolve(__dirname, "../../ui/dist"),
    ];
    const uiDist = candidates.find((p) => fs.existsSync(path.join(p, "index.html")));
    if (uiDist) {
      app.use(express.static(uiDist));
      app.get(/.*/, (_req, res) => {
        res.sendFile(path.join(uiDist, "index.html"));
      });
    } else {
      console.warn("[substaff] UI dist not found; running in API-only mode");
    }
  }

  if (opts.uiMode === "vite-dev") {
    const uiRoot = path.resolve(__dirname, "../../ui");
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      root: uiRoot,
      appType: "spa",
      server: {
        middlewareMode: true,
        allowedHosts: true,
      },
    });

    app.use(vite.middlewares);
    app.get(/.*/, async (req, res, next) => {
      try {
        const templatePath = path.resolve(uiRoot, "index.html");
        const template = fs.readFileSync(templatePath, "utf-8");
        const html = await vite.transformIndexHtml(req.originalUrl, template);
        res.status(200).set({ "Content-Type": "text/html" }).end(html);
      } catch (err) {
        next(err);
      }
    });
  }

  app.use(errorHandler);

  return app;
}
