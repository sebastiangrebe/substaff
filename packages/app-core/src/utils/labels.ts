/**
 * Human-friendly display labels for statuses, roles, and other enums.
 * Platform-agnostic — used by both web and native.
 */

export const issueStatusLabel: Record<string, string> = {
  backlog: "Later",
  todo: "To Do",
  in_progress: "Working on it",
  in_review: "Review",
  done: "Done",
  cancelled: "Cancelled",
  blocked: "Stuck",
};

export const agentStatusLabel: Record<string, string> = {
  active: "Available",
  running: "Working",
  idle: "Available",
  paused: "Paused",
  error: "Needs help",
  pending_approval: "Waiting for review",
  terminated: "Archived",
};

export const goalStatusLabel: Record<string, string> = {
  planned: "Planned",
  active: "Active",
  achieved: "Achieved",
  cancelled: "Cancelled",
};

export const projectStatusLabel: Record<string, string> = {
  backlog: "Later",
  planned: "Planned",
  in_progress: "In Progress",
  completed: "Completed",
  cancelled: "Cancelled",
};

export const approvalStatusLabel: Record<string, string> = {
  pending: "Pending",
  revision_requested: "Changes requested",
  approved: "Approved",
  rejected: "Rejected",
  cancelled: "Cancelled",
};

export const runStatusLabel: Record<string, string> = {
  queued: "Queued",
  running: "Working",
  completed: "Completed",
  failed: "Failed",
  timed_out: "Timed out",
  succeeded: "Completed",
};

export const agentRoleLabel: Record<string, string> = {
  ceo: "CEO",
  cto: "CTO",
  cmo: "CMO",
  cfo: "CFO",
  engineer: "Engineer",
  designer: "Designer",
  pm: "Project Manager",
  qa: "Quality Assurance",
  devops: "Operations",
  researcher: "Researcher",
  general: "General",
};

export function formatLabel(value: string): string {
  return value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function statusLabel(status: string): string {
  return (
    issueStatusLabel[status] ??
    agentStatusLabel[status] ??
    goalStatusLabel[status] ??
    projectStatusLabel[status] ??
    approvalStatusLabel[status] ??
    runStatusLabel[status] ??
    formatLabel(status)
  );
}
