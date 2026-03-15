/**
 * Compact response helpers.
 *
 * When `?compact=true` is present on a GET request, these functions strip
 * unnecessary fields from response payloads to reduce token usage for AI agents.
 */

import type { Request } from "express";

export function isCompact(req: Request): boolean {
  return req.query.compact === "true";
}

export function compactIssue(issue: Record<string, any>): Record<string, any> {
  return {
    id: issue.id,
    identifier: issue.identifier,
    title: issue.title,
    status: issue.status,
    priority: issue.priority,
    assigneeAgentId: issue.assigneeAgentId,
    assigneeUserId: issue.assigneeUserId,
    projectId: issue.projectId,
    goalId: issue.goalId,
    parentId: issue.parentId,
    labels: issue.labels,
    ...(issue.activeRun
      ? { activeRun: { id: issue.activeRun.id, status: issue.activeRun.status } }
      : {}),
    ...(issue.ancestors
      ? { ancestors: issue.ancestors.map((a: any) => compactIssue(a)) }
      : {}),
    ...(issue.project
      ? { project: { id: issue.project.id, name: issue.project.name, status: issue.project.status } }
      : {}),
    ...(issue.goal
      ? { goal: { id: issue.goal.id, title: issue.goal.title, status: issue.goal.status } }
      : {}),
  };
}

export function compactAgent(agent: Record<string, any>): Record<string, any> {
  return {
    id: agent.id,
    name: agent.name,
    role: agent.role,
    title: agent.title,
    status: agent.status,
    reportsTo: agent.reportsTo,
    urlKey: agent.urlKey,
  };
}

export function compactGoalTree(goal: Record<string, any>): Record<string, any> {
  return {
    goalId: goal.goalId,
    goalStatus: goal.goalStatus,
    ownerAgentId: goal.ownerAgentId,
    title: goal.title?.substring(0, 120),
    issues: goal.issues,
    completionPercent: goal.completionPercent,
    projects: goal.projects?.map((p: any) => ({
      projectId: p.projectId,
      name: p.name,
      status: p.status,
      leadAgentId: p.leadAgentId,
      issues: p.issues,
      completionPercent: p.completionPercent,
    })),
  };
}

export function compactComment(comment: Record<string, any>): Record<string, any> {
  return {
    id: comment.id,
    issueId: comment.issueId,
    authorAgentId: comment.authorAgentId,
    authorUserId: comment.authorUserId,
    body: comment.body,
    createdAt: comment.createdAt,
  };
}
