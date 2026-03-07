import { Router } from "express";
import { eq } from "drizzle-orm";
import type { Db } from "@substaff/db";
import { vendors, vendorMemberships, vendorUsage, companies } from "@substaff/db";
import { LLM_PROVIDERS, type LlmProvider, type SetVendorLlmKeyInput } from "@substaff/shared";
import { assertBoard, assertVendorAccess } from "./authz.js";
import { llmKeyManagerService } from "../services/llm-key-manager.js";
import { secretService } from "../services/secrets.js";
import { badRequest } from "../errors.js";

export function vendorRoutes(db: Db) {
  const router = Router();

  // GET /api/vendors — list vendors for the authenticated user
  router.get("/vendors", async (req, res) => {
    assertBoard(req);
    if (!req.actor.userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const memberships = await db
      .select({
        vendorId: vendorMemberships.vendorId,
        role: vendorMemberships.role,
      })
      .from(vendorMemberships)
      .where(eq(vendorMemberships.userId, req.actor.userId));

    if (memberships.length === 0) {
      res.json({ vendors: [] });
      return;
    }

    const vendorIds = memberships.map((m) => m.vendorId);
    const vendorRows = await db
      .select()
      .from(vendors)
      .where(eq(vendors.id, vendorIds[0]!));

    res.json({ vendors: vendorRows });
  });

  // POST /api/vendors — create a new vendor (registration)
  router.post("/vendors", async (req, res) => {
    assertBoard(req);
    if (!req.actor.userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const { name, slug, billingEmail } = req.body as {
      name: string;
      slug: string;
      billingEmail: string;
    };

    if (!name || !slug || !billingEmail) {
      res.status(400).json({ error: "name, slug, and billingEmail are required" });
      return;
    }

    const [vendor] = await db
      .insert(vendors)
      .values({ name, slug, billingEmail })
      .returning();

    await db
      .insert(vendorMemberships)
      .values({
        vendorId: vendor!.id,
        userId: req.actor.userId,
        role: "owner",
      });

    res.status(201).json({ vendor });
  });

  // GET /api/vendors/:vendorId — get vendor details
  router.get("/vendors/:vendorId", async (req, res) => {
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

    res.json({ vendor });
  });

  // GET /api/vendors/:vendorId/usage — get current usage
  router.get("/vendors/:vendorId/usage", async (req, res) => {
    assertBoard(req);
    assertVendorAccess(req, req.params.vendorId!);

    const usage = await db
      .select()
      .from(vendorUsage)
      .where(eq(vendorUsage.vendorId, req.params.vendorId!))
      .orderBy(vendorUsage.periodEnd)
      .limit(1);

    res.json({ usage: usage[0] ?? null });
  });

  // GET /api/vendors/:vendorId/members — list vendor members
  router.get("/vendors/:vendorId/members", async (req, res) => {
    assertBoard(req);
    assertVendorAccess(req, req.params.vendorId!);

    const members = await db
      .select()
      .from(vendorMemberships)
      .where(eq(vendorMemberships.vendorId, req.params.vendorId!));

    res.json({ members });
  });

  // --- LLM Key Configuration Routes ---

  const llmKeyMgr = llmKeyManagerService(db);
  const secrets = secretService(db);

  // GET /api/vendors/:vendorId/llm-config
  // Returns whether the vendor uses managed keys or has their own, and which providers are available.
  router.get("/vendors/:vendorId/llm-config", async (req, res) => {
    assertBoard(req);
    assertVendorAccess(req, req.params.vendorId!);

    // Find a company belonging to this vendor to check secrets
    const vendorCompanies = await db
      .select({ id: companies.id })
      .from(companies)
      .where(eq(companies.vendorId, req.params.vendorId!))
      .limit(1);

    const companyId = vendorCompanies[0]?.id;
    if (!companyId) {
      // Vendor has no companies yet — return defaults
      const managedKeysAvailable =
        !!process.env.MANAGED_ANTHROPIC_API_KEY || !!process.env.MANAGED_OPENAI_API_KEY;
      res.json({
        llmConfig: {
          providers: {
            anthropic: { hasOwnKey: false, usingManagedKey: managedKeysAvailable && !!process.env.MANAGED_ANTHROPIC_API_KEY },
            openai: { hasOwnKey: false, usingManagedKey: managedKeysAvailable && !!process.env.MANAGED_OPENAI_API_KEY },
          },
          managedKeysAvailable,
        },
      });
      return;
    }

    const config = await llmKeyMgr.getVendorLlmConfig(req.params.vendorId!, companyId);
    res.json({ llmConfig: config });
  });

  // POST /api/vendors/:vendorId/llm-config
  // Allows vendor to set their own API key (stored via secrets service) or opt into managed keys.
  router.post("/vendors/:vendorId/llm-config", async (req, res) => {
    assertBoard(req);
    assertVendorAccess(req, req.params.vendorId!);

    const { provider, apiKey } = req.body as SetVendorLlmKeyInput;

    if (!provider || !LLM_PROVIDERS.includes(provider)) {
      throw badRequest(`Invalid provider. Must be one of: ${LLM_PROVIDERS.join(", ")}`);
    }

    // Find a company belonging to this vendor to store the secret
    const vendorCompanies = await db
      .select({ id: companies.id })
      .from(companies)
      .where(eq(companies.vendorId, req.params.vendorId!))
      .limit(1);

    const companyId = vendorCompanies[0]?.id;
    if (!companyId) {
      throw badRequest("Vendor has no companies. Create a company first.");
    }

    const secretName = provider === "anthropic" ? "ANTHROPIC_API_KEY" : "OPENAI_API_KEY";

    if (apiKey === null) {
      // Remove the vendor's own key — fall back to managed
      const existing = await secrets.getByName(companyId, secretName);
      if (existing) {
        await secrets.remove(existing.id);
      }
    } else {
      // Store or rotate the vendor's own key
      const existing = await secrets.getByName(companyId, secretName);
      if (existing) {
        await secrets.rotate(existing.id, { value: apiKey });
      } else {
        await secrets.create(companyId, {
          name: secretName,
          provider: "local_encrypted",
          value: apiKey,
          description: `Vendor-provided ${provider} API key`,
        });
      }
    }

    const config = await llmKeyMgr.getVendorLlmConfig(req.params.vendorId!, companyId);
    res.json({ llmConfig: config });
  });

  return router;
}
