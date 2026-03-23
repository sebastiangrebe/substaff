/**
 * Canonical status & priority color definitions (Tailwind classes).
 * Platform-agnostic — used by both web and native components.
 */

// Issue status icon: text + border classes
export const issueStatusIcon: Record<string, string> = {
  backlog: "text-muted-foreground border-muted-foreground",
  todo: "text-indigo-600 border-indigo-600",
  in_progress: "text-amber-600 border-amber-600",
  in_review: "text-violet-600 border-violet-600",
  done: "text-emerald-600 border-emerald-600",
  cancelled: "text-neutral-500 border-neutral-500",
  blocked: "text-rose-600 border-rose-600",
};
export const issueStatusIconDefault = "text-muted-foreground border-muted-foreground";

// Badge bg + text classes
export const statusBadge: Record<string, string> = {
  active: "bg-green-100 text-green-700",
  running: "bg-indigo-100 text-indigo-700",
  paused: "bg-orange-100 text-orange-700",
  idle: "bg-yellow-100 text-yellow-700",
  archived: "bg-gray-100 text-gray-500",
  planned: "bg-gray-100 text-gray-500",
  achieved: "bg-green-100 text-green-700",
  completed: "bg-green-100 text-green-700",
  failed: "bg-red-100 text-red-700",
  timed_out: "bg-orange-100 text-orange-700",
  succeeded: "bg-green-100 text-green-700",
  error: "bg-red-100 text-red-700",
  terminated: "bg-red-100 text-red-700",
  pending: "bg-yellow-100 text-yellow-700",
  pending_approval: "bg-amber-100 text-amber-700",
  revision_requested: "bg-amber-100 text-amber-700",
  approved: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-700",
  backlog: "bg-gray-100 text-gray-500",
  todo: "bg-indigo-100 text-indigo-700",
  in_progress: "bg-amber-100 text-amber-700",
  in_review: "bg-violet-100 text-violet-700",
  blocked: "bg-rose-100 text-rose-700",
  done: "bg-emerald-100 text-emerald-700",
  cancelled: "bg-gray-100 text-gray-500",
};
export const statusBadgeDefault = "bg-gray-100 text-gray-500";

// Agent status dot
export const agentStatusDot: Record<string, string> = {
  running: "bg-indigo-400",
  active: "bg-green-400",
  paused: "bg-yellow-400",
  idle: "bg-yellow-400",
  pending_approval: "bg-amber-400",
  error: "bg-red-400",
  archived: "bg-neutral-400",
};
export const agentStatusDotDefault = "bg-neutral-400";

// Priority colors
export const priorityColor: Record<string, string> = {
  critical: "text-red-600",
  high: "text-orange-600",
  medium: "text-yellow-600",
  low: "text-blue-600",
};
export const priorityColorDefault = "text-yellow-600";
