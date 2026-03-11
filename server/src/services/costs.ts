import { and, desc, eq, gte, inArray, isNotNull, lte, sql } from "drizzle-orm";
import type { Db } from "@substaff/db";
import { agents, companies, costEvents, heartbeatRuns, issues, projects, vendors } from "@substaff/db";
import { DEFAULT_MARKUP_BASIS_POINTS } from "@substaff/shared";
import { notFound, unprocessable } from "../errors.js";

export interface CostDateRange {
  from?: Date;
  to?: Date;
}

export function costService(db: Db) {
  return {
    createEvent: async (companyId: string, data: Omit<typeof costEvents.$inferInsert, "companyId">) => {
      const agent = await db
        .select()
        .from(agents)
        .where(eq(agents.id, data.agentId))
        .then((rows) => rows[0] ?? null);

      if (!agent) throw notFound("Agent not found");
      if (agent.companyId !== companyId) {
        throw unprocessable("Agent does not belong to company");
      }

      const [event] = await db
        .insert(costEvents)
        .values({ ...data, companyId })
        .returning();

      // Enqueue async processing: markup, credit deduction, budget checks
      const { enqueueCostProcessing } = await import("../queues/index.js");
      const enqueued = enqueueCostProcessing({
        costEventId: event.id,
        vendorId: event.vendorId,
        companyId,
        agentId: event.agentId,
        rawCostCents: event.costCents,
      });

      // Fallback: inline budget update if queue unavailable
      if (!enqueued && event.costCents > 0) {
        // Look up vendor markup for platform cost calculation
        const [vendor] = await db
          .select({ markupBasisPoints: vendors.markupBasisPoints })
          .from(vendors)
          .where(eq(vendors.id, event.vendorId));
        const markup = vendor?.markupBasisPoints ?? DEFAULT_MARKUP_BASIS_POINTS;
        const platformCost = Math.round((event.costCents * markup) / 10000);

        await db
          .update(agents)
          .set({
            spentMonthlyCents: sql`${agents.spentMonthlyCents} + ${event.costCents}`,
            platformSpentMonthlyCents: sql`${agents.platformSpentMonthlyCents} + ${platformCost}`,
            updatedAt: new Date(),
          })
          .where(eq(agents.id, event.agentId));

        await db
          .update(companies)
          .set({
            spentMonthlyCents: sql`${companies.spentMonthlyCents} + ${event.costCents}`,
            platformSpentMonthlyCents: sql`${companies.platformSpentMonthlyCents} + ${platformCost}`,
            updatedAt: new Date(),
          })
          .where(eq(companies.id, companyId));

        // Inline budget check fallback
        const updatedAgent = await db
          .select()
          .from(agents)
          .where(eq(agents.id, event.agentId))
          .then((rows) => rows[0] ?? null);

        if (
          updatedAgent &&
          updatedAgent.budgetMonthlyCents > 0 &&
          updatedAgent.spentMonthlyCents >= updatedAgent.budgetMonthlyCents &&
          updatedAgent.status !== "paused" &&
          updatedAgent.status !== "terminated"
        ) {
          await db
            .update(agents)
            .set({ status: "paused", updatedAt: new Date() })
            .where(eq(agents.id, updatedAgent.id));
        }
      }

      return event;
    },

    summary: async (companyId: string, range?: CostDateRange) => {
      const company = await db
        .select()
        .from(companies)
        .where(eq(companies.id, companyId))
        .then((rows) => rows[0] ?? null);

      if (!company) throw notFound("Company not found");

      const conditions: ReturnType<typeof eq>[] = [eq(costEvents.companyId, companyId)];
      if (range?.from) conditions.push(gte(costEvents.occurredAt, range.from));
      if (range?.to) conditions.push(lte(costEvents.occurredAt, range.to));

      const [{ total, platformTotal }] = await db
        .select({
          total: sql<number>`coalesce(sum(${costEvents.costCents}), 0)::int`,
          platformTotal: sql<number>`coalesce(sum(${costEvents.platformCostCents}), 0)::int`,
        })
        .from(costEvents)
        .where(and(...conditions));

      const platformSpendCents = Number(platformTotal);
      const utilization =
        company.budgetMonthlyCents > 0
          ? (platformSpendCents / company.budgetMonthlyCents) * 100
          : 0;

      return {
        companyId,
        platformSpendCents,
        budgetCents: company.budgetMonthlyCents,
        utilizationPercent: Number(utilization.toFixed(2)),
      };
    },

    byAgent: async (companyId: string, range?: CostDateRange) => {
      const conditions: ReturnType<typeof eq>[] = [eq(costEvents.companyId, companyId)];
      if (range?.from) conditions.push(gte(costEvents.occurredAt, range.from));
      if (range?.to) conditions.push(lte(costEvents.occurredAt, range.to));

      const costRows = await db
        .select({
          agentId: costEvents.agentId,
          agentName: agents.name,
          agentStatus: agents.status,
          platformCostCents: sql<number>`coalesce(sum(${costEvents.platformCostCents}), 0)::int`,
          inputTokens: sql<number>`coalesce(sum(${costEvents.inputTokens}), 0)::int`,
          outputTokens: sql<number>`coalesce(sum(${costEvents.outputTokens}), 0)::int`,
        })
        .from(costEvents)
        .leftJoin(agents, eq(costEvents.agentId, agents.id))
        .where(and(...conditions))
        .groupBy(costEvents.agentId, agents.name, agents.status)
        .orderBy(desc(sql`coalesce(sum(${costEvents.platformCostCents}), 0)::int`));

      const runConditions: ReturnType<typeof eq>[] = [eq(heartbeatRuns.companyId, companyId)];
      if (range?.from) runConditions.push(gte(heartbeatRuns.finishedAt, range.from));
      if (range?.to) runConditions.push(lte(heartbeatRuns.finishedAt, range.to));

      const runRows = await db
        .select({
          agentId: heartbeatRuns.agentId,
          apiRunCount:
            sql<number>`coalesce(sum(case when coalesce((${heartbeatRuns.usageJson} ->> 'billingType'), 'unknown') = 'api' then 1 else 0 end), 0)::int`,
          subscriptionRunCount:
            sql<number>`coalesce(sum(case when coalesce((${heartbeatRuns.usageJson} ->> 'billingType'), 'unknown') = 'subscription' then 1 else 0 end), 0)::int`,
          subscriptionInputTokens:
            sql<number>`coalesce(sum(case when coalesce((${heartbeatRuns.usageJson} ->> 'billingType'), 'unknown') = 'subscription' then coalesce((${heartbeatRuns.usageJson} ->> 'inputTokens')::int, 0) else 0 end), 0)::int`,
          subscriptionOutputTokens:
            sql<number>`coalesce(sum(case when coalesce((${heartbeatRuns.usageJson} ->> 'billingType'), 'unknown') = 'subscription' then coalesce((${heartbeatRuns.usageJson} ->> 'outputTokens')::int, 0) else 0 end), 0)::int`,
        })
        .from(heartbeatRuns)
        .where(and(...runConditions))
        .groupBy(heartbeatRuns.agentId);

      const runRowsByAgent = new Map(runRows.map((row) => [row.agentId, row]));
      return costRows.map((row) => {
        const runRow = runRowsByAgent.get(row.agentId);
        return {
          ...row,
          apiRunCount: runRow?.apiRunCount ?? 0,
          subscriptionRunCount: runRow?.subscriptionRunCount ?? 0,
          subscriptionInputTokens: runRow?.subscriptionInputTokens ?? 0,
          subscriptionOutputTokens: runRow?.subscriptionOutputTokens ?? 0,
        };
      });
    },

    byProject: async (companyId: string, range?: CostDateRange) => {
      // Cost events typically lack projectId, so we attribute agent costs
      // to projects proportionally based on the agent's assigned issues per project.
      const conditions: ReturnType<typeof eq>[] = [eq(costEvents.companyId, companyId)];
      if (range?.from) conditions.push(gte(costEvents.occurredAt, range.from));
      if (range?.to) conditions.push(lte(costEvents.occurredAt, range.to));

      // Get per-agent cost totals (platform costs only — never expose raw LLM costs)
      const agentCosts = await db
        .select({
          agentId: costEvents.agentId,
          platformCostCents: sql<number>`coalesce(sum(${costEvents.platformCostCents}), 0)::int`,
          inputTokens: sql<number>`coalesce(sum(${costEvents.inputTokens}), 0)::int`,
          outputTokens: sql<number>`coalesce(sum(${costEvents.outputTokens}), 0)::int`,
        })
        .from(costEvents)
        .where(and(...conditions))
        .groupBy(costEvents.agentId);

      if (agentCosts.length === 0) return [];

      // Get issue-count-per-project for each agent (for proportional attribution)
      const agentIds = agentCosts.map((r) => r.agentId);
      const agentProjectCounts = await db
        .select({
          agentId: issues.assigneeAgentId,
          projectId: issues.projectId,
          projectName: projects.name,
          issueCount: sql<number>`count(*)::int`,
        })
        .from(issues)
        .innerJoin(projects, eq(issues.projectId, projects.id))
        .where(
          and(
            eq(issues.companyId, companyId),
            isNotNull(issues.projectId),
            isNotNull(issues.assigneeAgentId),
            inArray(issues.assigneeAgentId, agentIds),
          ),
        )
        .groupBy(issues.assigneeAgentId, issues.projectId, projects.name);

      // Build agent → project weights
      const agentProjectMap = new Map<string, { projectId: string; projectName: string; weight: number }[]>();
      for (const row of agentProjectCounts) {
        if (!row.agentId) continue;
        const list = agentProjectMap.get(row.agentId) ?? [];
        list.push({ projectId: row.projectId!, projectName: row.projectName, weight: row.issueCount });
        agentProjectMap.set(row.agentId, list);
      }

      // Distribute each agent's costs proportionally across projects
      const projectTotals = new Map<string, {
        projectName: string;
        platformCostCents: number;
        inputTokens: number;
        outputTokens: number;
      }>();

      for (const ac of agentCosts) {
        const projectWeights = agentProjectMap.get(ac.agentId);
        if (!projectWeights || projectWeights.length === 0) continue;

        const totalWeight = projectWeights.reduce((s, p) => s + p.weight, 0);
        for (const pw of projectWeights) {
          const fraction = pw.weight / totalWeight;
          const existing = projectTotals.get(pw.projectId) ?? {
            projectName: pw.projectName,
            platformCostCents: 0,
            inputTokens: 0,
            outputTokens: 0,
          };
          existing.platformCostCents += Math.round(ac.platformCostCents * fraction);
          existing.inputTokens += Math.round(ac.inputTokens * fraction);
          existing.outputTokens += Math.round(ac.outputTokens * fraction);
          projectTotals.set(pw.projectId, existing);
        }
      }

      return [...projectTotals.entries()]
        .map(([projectId, data]) => ({ projectId, ...data }))
        .sort((a, b) => b.platformCostCents - a.platformCostCents);
    },
  };
}
