import { statusLabel } from "./labels";

/** Comprehensive human-friendly labels for every activity action type. */
const ACTION_LABELS: Record<string, string> = {
  // Issues / Tasks
  "issue.created": "created a task",
  "issue.updated": "updated the task",
  "issue.checked_out": "started working on a task",
  "issue.released": "finished working on a task",
  "issue.comment_added": "added a comment",
  "issue.commented": "added a comment",
  "issue.attachment_added": "attached a file",
  "issue.attachment_removed": "removed a file",
  "issue.deleted": "deleted a task",
  "issue.checkout_lock_adopted": "took over a task",
  "issue.dependency_added": "linked a dependency",
  "issue.dependency_removed": "removed a dependency",
  "issue.approval_linked": "linked a review",
  "issue.approval_unlinked": "unlinked a review",

  // Labels
  "label.created": "created a label",
  "label.deleted": "deleted a label",

  // Agents / Team members
  "agent.created": "added a team member",
  "agent.updated": "updated a team member",
  "agent.paused": "paused a team member",
  "agent.resumed": "resumed a team member",
  "agent.terminated": "archived a team member",
  "agent.deleted": "removed a team member",
  "agent.key_created": "created an API key",
  "agent.budget_updated": "updated the budget",
  "agent.runtime_session_reset": "reset the session",
  "agent.config_rolled_back": "rolled back configuration",
  "agent.hire_created": "started a hiring request",
  "agent.permissions_updated": "updated permissions",
  "agent.instructions_path_updated": "updated instructions",

  // Heartbeat / Work sessions
  "heartbeat.invoked": "started a work session",
  "heartbeat.cancelled": "stopped a work session",

  // Approvals / Reviews
  "approval.created": "requested a review",
  "approval.approved": "approved a review",
  "approval.rejected": "rejected a review",
  "approval.revision_requested": "requested changes",
  "approval.resubmitted": "resubmitted for review",
  "approval.comment_added": "commented on a review",
  "approval.requester_wakeup_queued": "scheduled a follow-up",
  "approval.requester_wakeup_failed": "follow-up scheduling failed",

  // Projects
  "project.created": "created a project",
  "project.updated": "updated a project",
  "project.deleted": "deleted a project",
  "project.workspace_created": "set up a project workspace",
  "project.workspace_updated": "updated a project workspace",
  "project.workspace_deleted": "removed a project workspace",
  "project_state.updated": "updated project progress",

  // Goals
  "goal.created": "set a new goal",
  "goal.updated": "updated a goal",
  "goal.deleted": "removed a goal",

  // Costs
  "cost.reported": "reported a cost",
  "cost.recorded": "recorded a cost",

  // Company / Workspace
  "company.created": "created a workspace",
  "company.updated": "updated workspace settings",
  "company.archived": "archived a workspace",
  "company.budget_updated": "updated the workspace budget",
  "company.org_chart_updated": "updated the org chart",
  "company.imported": "imported a workspace",
  "company.template_applied": "applied a template",

  // Secrets
  "secret.created": "added a secret",
  "secret.rotated": "rotated a secret",
  "secret.updated": "updated a secret",
  "secret.deleted": "removed a secret",

  // Integrations
  "integration.connected": "connected a service",
  "integration.updated": "updated a connection",
  "integration.disconnected": "disconnected a service",

  // Access / Invites
  "invite.created": "sent an invitation",
  "invite.revoked": "revoked an invitation",
  "join.requested": "requested to join",
  "join.approved": "approved a join request",
  "join.rejected": "declined a join request",
  "agent_api_key.claimed": "claimed an API key",

  // Assets
  "asset.created": "uploaded a file",
};

function humanizeValue(value: unknown): string {
  if (typeof value !== "string") return String(value ?? "none");
  return statusLabel(value);
}

/**
 * Format an activity action into a plain-language verb phrase.
 * Handles special-case detail expansion for `issue.updated`.
 */
export function formatActivityVerb(
  action: string,
  details?: Record<string, unknown> | null,
): string {
  if (action === "issue.updated" && details) {
    const previous = (details._previous ?? {}) as Record<string, unknown>;
    const parts: string[] = [];

    if (details.status !== undefined) {
      const from = previous.status;
      parts.push(
        from
          ? `changed the status from ${humanizeValue(from)} to ${humanizeValue(details.status)}`
          : `changed the status to ${humanizeValue(details.status)}`,
      );
    }
    if (details.priority !== undefined) {
      const from = previous.priority;
      parts.push(
        from
          ? `changed the priority from ${humanizeValue(from)} to ${humanizeValue(details.priority)}`
          : `changed the priority to ${humanizeValue(details.priority)}`,
      );
    }
    if (details.assigneeAgentId !== undefined || details.assigneeUserId !== undefined) {
      parts.push(
        details.assigneeAgentId || details.assigneeUserId
          ? "assigned the task"
          : "unassigned the task",
      );
    }
    if (details.title !== undefined) parts.push("updated the title");
    if (details.description !== undefined) parts.push("updated the description");

    if (parts.length > 0) return parts.join(", ");
  }

  return ACTION_LABELS[action] ?? action.replace(/[._]/g, " ");
}

/** Human-friendly entity type labels for filter dropdowns. */
export const ENTITY_TYPE_LABELS: Record<string, string> = {
  issue: "Tasks",
  agent: "Team Members",
  project: "Projects",
  goal: "Goals",
  approval: "Reviews",
  heartbeat_run: "Work Sessions",
  company: "Workspace",
  cost: "Costs",
  secret: "Secrets",
  integration: "Connections",
  label: "Labels",
  asset: "Files",
  invite: "Invitations",
};

/** Human-friendly label for an entity type string. */
export function humanizeEntityType(type: string): string {
  return ENTITY_TYPE_LABELS[type] ?? type.charAt(0).toUpperCase() + type.slice(1).replace(/_/g, " ");
}

/** Human-friendly actor name. */
export function humanizeActorName(
  actorType: string,
  actorName?: string | null,
): string {
  if (actorType === "system") return "Substaff";
  if (actorType === "user") return actorName ?? "You";
  return actorName ?? "Unknown";
}
