/**
 * Human-friendly display labels for statuses, roles, and other enums.
 *
 * Centralised here so every component uses the same retail-friendly wording.
 * Monday.com-inspired: "Working on it", "Stuck", "Later" etc.
 */

// ---------------------------------------------------------------------------
// Issue / task statuses
// ---------------------------------------------------------------------------

export const issueStatusLabel: Record<string, string> = {
  backlog: "Later",
  todo: "To Do",
  in_progress: "Working on it",
  in_review: "Review",
  done: "Done",
  cancelled: "Cancelled",
  blocked: "Stuck",
};

// ---------------------------------------------------------------------------
// Agent statuses — shown as human-readable worker states
// ---------------------------------------------------------------------------

export const agentStatusLabel: Record<string, string> = {
  active: "Available",
  running: "Working",
  idle: "Available",
  paused: "Paused",
  error: "Needs help",
  pending_approval: "Waiting for review",
  terminated: "Archived",
};

// ---------------------------------------------------------------------------
// Goal statuses
// ---------------------------------------------------------------------------

export const goalStatusLabel: Record<string, string> = {
  planned: "Planned",
  active: "Active",
  achieved: "Achieved",
  cancelled: "Cancelled",
};

// ---------------------------------------------------------------------------
// Project statuses
// ---------------------------------------------------------------------------

export const projectStatusLabel: Record<string, string> = {
  backlog: "Later",
  planned: "Planned",
  in_progress: "In Progress",
  completed: "Completed",
  cancelled: "Cancelled",
};

// ---------------------------------------------------------------------------
// Approval statuses
// ---------------------------------------------------------------------------

export const approvalStatusLabel: Record<string, string> = {
  pending: "Pending",
  revision_requested: "Changes requested",
  approved: "Approved",
  rejected: "Rejected",
  cancelled: "Cancelled",
};

// ---------------------------------------------------------------------------
// Run statuses
// ---------------------------------------------------------------------------

export const runStatusLabel: Record<string, string> = {
  queued: "Queued",
  running: "Working",
  completed: "Completed",
  failed: "Failed",
  timed_out: "Timed out",
  succeeded: "Completed",
};

// ---------------------------------------------------------------------------
// Agent roles — friendly titles
// ---------------------------------------------------------------------------

export const agentRoleLabel: Record<string, string> = {
  ceo: "CEO",
  cto: "CTO",
  cmo: "CMO",
  cfo: "CFO",
  engineer: "Engineer",
  designer: "Designer",
  pm: "Project Manager",
  qa: "QA Specialist",
  devops: "DevOps",
  researcher: "Researcher",
  general: "General",
};

// ---------------------------------------------------------------------------
// Generic fallback — converts snake_case to Title Case
// ---------------------------------------------------------------------------

export function formatLabel(value: string): string {
  return value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Get the best label for any status value.
 * Checks issue, agent, goal, project, approval, and run label maps.
 * Falls back to formatted snake_case.
 */
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
