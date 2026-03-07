import { eq, inArray, sql } from "drizzle-orm";
import type { Db } from "@substaff/db";
import { goals, projectGoals, projects, issues } from "@substaff/db";
import type { GoalProgress, ProjectProgress, IssueCounts } from "@substaff/shared";

function emptyIssueCounts(): IssueCounts {
  return { total: 0, done: 0, inProgress: 0, blocked: 0, open: 0 };
}

function addIssueCounts(target: IssueCounts, source: IssueCounts) {
  target.total += source.total;
  target.done += source.done;
  target.inProgress += source.inProgress;
  target.blocked += source.blocked;
  target.open += source.open;
}

function aggregateIssueCounts(rows: { status: string; count: number }[]): IssueCounts {
  const counts = emptyIssueCounts();
  for (const row of rows) {
    const c = Number(row.count);
    counts.total += c;
    if (row.status === "done") counts.done += c;
    if (row.status === "in_progress") counts.inProgress += c;
    if (row.status === "blocked") counts.blocked += c;
    if (row.status !== "done" && row.status !== "cancelled") counts.open += c;
  }
  return counts;
}

export function goalService(db: Db) {
  return {
    list: (companyId: string) => db.select().from(goals).where(eq(goals.companyId, companyId)),

    getById: (id: string) =>
      db
        .select()
        .from(goals)
        .where(eq(goals.id, id))
        .then((rows) => rows[0] ?? null),

    create: (companyId: string, data: Omit<typeof goals.$inferInsert, "companyId">) =>
      db
        .insert(goals)
        .values({ ...data, companyId })
        .returning()
        .then((rows) => rows[0]),

    update: (id: string, data: Partial<typeof goals.$inferInsert>) =>
      db
        .update(goals)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(goals.id, id))
        .returning()
        .then((rows) => rows[0] ?? null),

    remove: (id: string) =>
      db
        .delete(goals)
        .where(eq(goals.id, id))
        .returning()
        .then((rows) => rows[0] ?? null),

    progress: async (goalId: string): Promise<GoalProgress | null> => {
      const goal = await db
        .select()
        .from(goals)
        .where(eq(goals.id, goalId))
        .then((rows) => rows[0] ?? null);
      if (!goal) return null;

      // Find linked projects via project_goals
      const linkedProjects = await db
        .select({
          projectId: projectGoals.projectId,
          name: projects.name,
          status: projects.status,
          leadAgentId: projects.leadAgentId,
        })
        .from(projectGoals)
        .innerJoin(projects, eq(projectGoals.projectId, projects.id))
        .where(eq(projectGoals.goalId, goalId));

      const projectIds = linkedProjects.map((p) => p.projectId);

      // Get issue counts per project
      const projectProgressList: ProjectProgress[] = [];
      if (projectIds.length > 0) {
        const issueRows = await db
          .select({
            projectId: issues.projectId,
            status: issues.status,
            count: sql<number>`count(*)`,
          })
          .from(issues)
          .where(inArray(issues.projectId, projectIds))
          .groupBy(issues.projectId, issues.status);

        const projectIssueCounts = new Map<string, { status: string; count: number }[]>();
        for (const row of issueRows) {
          if (!row.projectId) continue;
          let arr = projectIssueCounts.get(row.projectId);
          if (!arr) {
            arr = [];
            projectIssueCounts.set(row.projectId, arr);
          }
          arr.push({ status: row.status, count: Number(row.count) });
        }

        for (const p of linkedProjects) {
          const counts = aggregateIssueCounts(projectIssueCounts.get(p.projectId) ?? []);
          const completionPercent = counts.total > 0 ? Math.round((counts.done / counts.total) * 100) : 0;
          projectProgressList.push({
            projectId: p.projectId,
            name: p.name,
            status: p.status,
            leadAgentId: p.leadAgentId,
            issues: counts,
            completionPercent,
          });
        }
      }

      // Also count issues directly linked to this goal (not via project)
      const directIssueRows = await db
        .select({ status: issues.status, count: sql<number>`count(*)` })
        .from(issues)
        .where(eq(issues.goalId, goalId))
        .groupBy(issues.status);

      // Aggregate: project issues + direct goal issues
      const overallCounts = emptyIssueCounts();
      for (const pp of projectProgressList) {
        addIssueCounts(overallCounts, pp.issues);
      }
      const directCounts = aggregateIssueCounts(directIssueRows);
      addIssueCounts(overallCounts, directCounts);

      const completionPercent =
        overallCounts.total > 0 ? Math.round((overallCounts.done / overallCounts.total) * 100) : 0;

      return {
        goalId: goal.id,
        goalStatus: goal.status,
        ownerAgentId: goal.ownerAgentId,
        title: goal.title,
        issues: overallCounts,
        completionPercent,
        projects: projectProgressList,
      };
    },

    tree: async (companyId: string): Promise<GoalProgress[]> => {
      const goalRows = await db.select().from(goals).where(eq(goals.companyId, companyId));
      if (goalRows.length === 0) return [];

      const goalIds = goalRows.map((g) => g.id);

      // All project_goals links for these goals
      const allLinks = await db
        .select({
          goalId: projectGoals.goalId,
          projectId: projectGoals.projectId,
          name: projects.name,
          status: projects.status,
          leadAgentId: projects.leadAgentId,
        })
        .from(projectGoals)
        .innerJoin(projects, eq(projectGoals.projectId, projects.id))
        .where(inArray(projectGoals.goalId, goalIds));

      const allProjectIds = [...new Set(allLinks.map((l) => l.projectId))];

      // Issue counts per project (batched)
      const projectIssueCounts = new Map<string, { status: string; count: number }[]>();
      if (allProjectIds.length > 0) {
        const issueRows = await db
          .select({
            projectId: issues.projectId,
            status: issues.status,
            count: sql<number>`count(*)`,
          })
          .from(issues)
          .where(inArray(issues.projectId, allProjectIds))
          .groupBy(issues.projectId, issues.status);

        for (const row of issueRows) {
          if (!row.projectId) continue;
          let arr = projectIssueCounts.get(row.projectId);
          if (!arr) {
            arr = [];
            projectIssueCounts.set(row.projectId, arr);
          }
          arr.push({ status: row.status, count: Number(row.count) });
        }
      }

      // Direct issue counts per goal (batched)
      const directIssueRows = await db
        .select({
          goalId: issues.goalId,
          status: issues.status,
          count: sql<number>`count(*)`,
        })
        .from(issues)
        .where(inArray(issues.goalId, goalIds))
        .groupBy(issues.goalId, issues.status);

      const goalDirectCounts = new Map<string, { status: string; count: number }[]>();
      for (const row of directIssueRows) {
        if (!row.goalId) continue;
        let arr = goalDirectCounts.get(row.goalId);
        if (!arr) {
          arr = [];
          goalDirectCounts.set(row.goalId, arr);
        }
        arr.push({ status: row.status, count: Number(row.count) });
      }

      // Group project links by goal
      const linksByGoal = new Map<string, typeof allLinks>();
      for (const link of allLinks) {
        let arr = linksByGoal.get(link.goalId);
        if (!arr) {
          arr = [];
          linksByGoal.set(link.goalId, arr);
        }
        arr.push(link);
      }

      // Build GoalProgress for each goal
      return goalRows.map((goal) => {
        const goalLinks = linksByGoal.get(goal.id) ?? [];
        const projectProgressList: ProjectProgress[] = goalLinks.map((p) => {
          const counts = aggregateIssueCounts(projectIssueCounts.get(p.projectId) ?? []);
          const pct = counts.total > 0 ? Math.round((counts.done / counts.total) * 100) : 0;
          return {
            projectId: p.projectId,
            name: p.name,
            status: p.status,
            leadAgentId: p.leadAgentId,
            issues: counts,
            completionPercent: pct,
          };
        });

        const overallCounts = emptyIssueCounts();
        for (const pp of projectProgressList) addIssueCounts(overallCounts, pp.issues);
        const directCounts = aggregateIssueCounts(goalDirectCounts.get(goal.id) ?? []);
        addIssueCounts(overallCounts, directCounts);

        const completionPercent =
          overallCounts.total > 0 ? Math.round((overallCounts.done / overallCounts.total) * 100) : 0;

        return {
          goalId: goal.id,
          goalStatus: goal.status,
          ownerAgentId: goal.ownerAgentId,
          title: goal.title,
          issues: overallCounts,
          completionPercent,
          projects: projectProgressList,
        };
      });
    },
  };
}
