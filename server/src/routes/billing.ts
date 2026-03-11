import { Router } from "express";
import { eq } from "drizzle-orm";
import type { Db } from "@substaff/db";
import { vendors } from "@substaff/db";
import { topUpSchema, updateMarkupSchema } from "@substaff/shared";
import { assertBoard, assertVendorAccess, getActorVendorId } from "./authz.js";
import { validate } from "../middleware/validate.js";
import { stripeService, initStripe } from "../services/stripe.js";
import { logActivity, type LogActivityInput } from "../services/activity-log.js";
import { logger } from "../middleware/logger.js";

export function billingRoutes(db: Db) {
  const router = Router();
  const billing = stripeService(db);

  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
  const stripeWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (stripeSecretKey) {
    initStripe(stripeSecretKey);
  }

  // GET /api/billing/me — resolve billing info from current user's vendor
  router.get("/billing/me", async (req, res) => {
    assertBoard(req);
    const vendorId = getActorVendorId(req);

    const [vendor] = await db
      .select()
      .from(vendors)
      .where(eq(vendors.id, vendorId));

    if (!vendor) {
      res.status(404).json({ error: "Vendor not found" });
      return;
    }

    const balance = await billing.getBalance(vendorId);

    res.json({
      vendorId: vendor.id,
      creditBalanceCents: balance.creditBalanceCents,
      markupBasisPoints: balance.markupBasisPoints,
      billingEmail: vendor.billingEmail,
      stripeCustomerId: vendor.stripeCustomerId,
      usedCostCents: balance.monthlyPlatformCostCents,
      platformCostCents: balance.monthlyPlatformCostCents,
    });
  });

  // GET /api/vendors/:vendorId/billing — get billing info
  router.get("/vendors/:vendorId/billing", async (req, res) => {
    assertBoard(req);
    assertVendorAccess(req, req.params.vendorId as string);

    const [vendor] = await db
      .select()
      .from(vendors)
      .where(eq(vendors.id, req.params.vendorId as string));

    if (!vendor) {
      res.status(404).json({ error: "Vendor not found" });
      return;
    }

    const balance = await billing.getBalance(req.params.vendorId as string);

    res.json({
      creditBalanceCents: balance.creditBalanceCents,
      markupBasisPoints: balance.markupBasisPoints,
      billingEmail: vendor.billingEmail,
      stripeCustomerId: vendor.stripeCustomerId,
      usedCostCents: balance.monthlyPlatformCostCents,
      platformCostCents: balance.monthlyPlatformCostCents,
    });
  });

  // GET /api/vendors/:vendorId/billing/balance — credit balance and month-to-date usage
  router.get("/vendors/:vendorId/billing/balance", async (req, res) => {
    assertBoard(req);
    assertVendorAccess(req, req.params.vendorId as string);

    const balance = await billing.getBalance(req.params.vendorId as string);
    res.json(balance);
  });

  // GET /api/vendors/:vendorId/billing/credits — paginated credit transaction history
  router.get("/vendors/:vendorId/billing/credits", async (req, res) => {
    assertBoard(req);
    assertVendorAccess(req, req.params.vendorId as string);

    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const offset = Number(req.query.offset) || 0;

    const rows = await billing.getCreditHistory(req.params.vendorId as string, limit, offset);
    res.json(rows);
  });

  // POST /api/vendors/:vendorId/billing/top-up — create Stripe Checkout session for credit top-up
  router.post("/vendors/:vendorId/billing/top-up", validate(topUpSchema), async (req, res) => {
    assertBoard(req);
    assertVendorAccess(req, req.params.vendorId as string);

    if (!stripeSecretKey) {
      res.status(501).json({ error: "Stripe not configured" });
      return;
    }

    const { amountCents } = req.body as { amountCents: number };
    const result = await billing.createTopUpSession(req.params.vendorId as string, amountCents);

    res.json(result);
  });

  // PATCH /api/vendors/:vendorId/billing/markup — update markup factor
  router.patch("/vendors/:vendorId/billing/markup", validate(updateMarkupSchema), async (req, res) => {
    assertBoard(req);
    assertVendorAccess(req, req.params.vendorId as string);

    const { markupBasisPoints } = req.body as { markupBasisPoints: number };

    const [vendor] = await db
      .update(vendors)
      .set({ markupBasisPoints, updatedAt: new Date() })
      .where(eq(vendors.id, req.params.vendorId as string))
      .returning();

    if (!vendor) {
      res.status(404).json({ error: "Vendor not found" });
      return;
    }

    res.json({ markupBasisPoints: vendor.markupBasisPoints });
  });

  // POST /api/vendors/:vendorId/billing/sync — sync usage from cost events
  router.post("/vendors/:vendorId/billing/sync", async (req, res) => {
    assertBoard(req);
    assertVendorAccess(req, req.params.vendorId as string);

    const usage = await billing.syncUsage(req.params.vendorId as string);
    res.json({ usage });
  });

  return router;
}
