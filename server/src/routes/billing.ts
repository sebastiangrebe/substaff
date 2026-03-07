import express, { Router } from "express";
import { eq } from "drizzle-orm";
import type { Db } from "@substaff/db";
import { vendors } from "@substaff/db";
import { assertBoard, assertVendorAccess } from "./authz.js";
import { stripeService, initStripe } from "../services/stripe.js";
import { logger } from "../middleware/logger.js";

export function billingRoutes(db: Db) {
  const router = Router();
  const billing = stripeService(db);

  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
  const stripeWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (stripeSecretKey) {
    initStripe(stripeSecretKey);
  }

  // GET /api/vendors/:vendorId/billing — get billing info
  router.get("/vendors/:vendorId/billing", async (req, res) => {
    assertBoard(req);
    assertVendorAccess(req, req.params.vendorId!);

    const [vendor] = await db
      .select()
      .from(vendors)
      .where(eq(vendors.id, req.params.vendorId!));

    if (!vendor) {
      res.status(404).json({ error: "Vendor not found" });
      return;
    }

    const budget = await billing.checkBudget(req.params.vendorId!);

    res.json({
      plan: vendor.plan,
      stripeCustomerId: vendor.stripeCustomerId,
      billingEmail: vendor.billingEmail,
      planTokenLimit: vendor.planTokenLimit,
      usedTokens: budget.usedTokens,
      budgetRemaining: budget.limit - budget.usedTokens,
    });
  });

  // POST /api/vendors/:vendorId/billing/subscribe — create or change subscription
  router.post("/vendors/:vendorId/billing/subscribe", async (req, res) => {
    assertBoard(req);
    assertVendorAccess(req, req.params.vendorId!);

    if (!stripeSecretKey) {
      res.status(501).json({ error: "Stripe not configured" });
      return;
    }

    const { priceId } = req.body as { priceId: string };
    if (!priceId) {
      res.status(400).json({ error: "priceId is required" });
      return;
    }

    const subscription = await billing.createSubscription(req.params.vendorId!, priceId);
    res.json({ subscription: { id: subscription.id, status: subscription.status } });
  });

  // POST /api/vendors/:vendorId/billing/sync — sync usage from cost events
  router.post("/vendors/:vendorId/billing/sync", async (req, res) => {
    assertBoard(req);
    assertVendorAccess(req, req.params.vendorId!);

    const usage = await billing.syncUsage(req.params.vendorId!);
    res.json({ usage });
  });

  // POST /api/webhooks/stripe — Stripe webhook endpoint
  router.post("/webhooks/stripe", express.raw({ type: "application/json" }), async (req, res) => {
    if (!stripeSecretKey || !stripeWebhookSecret) {
      res.status(501).json({ error: "Stripe not configured" });
      return;
    }

    const sig = req.headers["stripe-signature"];
    if (!sig) {
      res.status(400).json({ error: "Missing stripe-signature header" });
      return;
    }

    try {
      const Stripe = (await import("stripe")).default;
      const stripe = new Stripe(stripeSecretKey, { apiVersion: "2025-01-27.acacia" as any });
      const event = stripe.webhooks.constructEvent(req.body, sig as string, stripeWebhookSecret);
      await billing.handleWebhookEvent(event);
      res.json({ received: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.warn({ err }, "Stripe webhook verification failed");
      res.status(400).json({ error: `Webhook Error: ${message}` });
    }
  });

  return router;
}
