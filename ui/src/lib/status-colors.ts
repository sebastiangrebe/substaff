/**
 * Canonical status & priority color definitions.
 *
 * Every component that renders a status indicator (StatusIcon, StatusBadge,
 * agent status dots, etc.) should import from here so colors stay consistent.
 */

// ---------------------------------------------------------------------------
// Issue status colors
// ---------------------------------------------------------------------------

/** StatusIcon circle: text + border classes */
export const issueStatusIcon: Record<string, string> = {
  backlog: "text-muted-foreground border-muted-foreground",
  todo: "text-indigo-600 border-indigo-600 dark:text-indigo-400 dark:border-indigo-400",
  in_progress: "text-amber-600 border-amber-600 dark:text-amber-400 dark:border-amber-400",
  in_review: "text-violet-600 border-violet-600 dark:text-violet-400 dark:border-violet-400",
  done: "text-emerald-600 border-emerald-600 dark:text-emerald-400 dark:border-emerald-400",
  cancelled: "text-neutral-500 border-neutral-500",
  blocked: "text-rose-600 border-rose-600 dark:text-rose-400 dark:border-rose-400",
};

export const issueStatusIconDefault = "text-muted-foreground border-muted-foreground";

/** Text-only color for issue statuses (dropdowns, labels) */
export const issueStatusText: Record<string, string> = {
  backlog: "text-muted-foreground",
  todo: "text-indigo-600 dark:text-indigo-400",
  in_progress: "text-amber-600 dark:text-amber-400",
  in_review: "text-violet-600 dark:text-violet-400",
  done: "text-emerald-600 dark:text-emerald-400",
  cancelled: "text-neutral-500",
  blocked: "text-rose-600 dark:text-rose-400",
};

export const issueStatusTextDefault = "text-muted-foreground";

// ---------------------------------------------------------------------------
// Badge colors — used by StatusBadge for all entity types
// ---------------------------------------------------------------------------

export const statusBadge: Record<string, string> = {
  // Agent statuses
  active: "bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300",
  running: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300",
  paused: "bg-orange-100 text-orange-700 dark:bg-orange-900/50 dark:text-orange-300",
  idle: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/50 dark:text-yellow-300",
  archived: "bg-muted text-muted-foreground",

  // Goal statuses
  planned: "bg-muted text-muted-foreground",
  achieved: "bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300",
  completed: "bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300",

  // Run statuses
  failed: "bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300",
  timed_out: "bg-orange-100 text-orange-700 dark:bg-orange-900/50 dark:text-orange-300",
  succeeded: "bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300",
  error: "bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300",
  terminated: "bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300",
  pending: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/50 dark:text-yellow-300",

  // Approval statuses
  pending_approval: "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300",
  revision_requested: "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300",
  approved: "bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300",
  rejected: "bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300",

  // Issue statuses — consistent hues with issueStatusIcon above
  backlog: "bg-muted text-muted-foreground",
  todo: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300",
  in_progress: "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300",
  in_review: "bg-violet-100 text-violet-700 dark:bg-violet-900/50 dark:text-violet-300",
  blocked: "bg-rose-100 text-rose-700 dark:bg-rose-900/50 dark:text-rose-300",
  done: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300",
  cancelled: "bg-muted text-muted-foreground",
};

export const statusBadgeDefault = "bg-muted text-muted-foreground";

// ---------------------------------------------------------------------------
// Agent status dot — solid background for small indicator dots
// ---------------------------------------------------------------------------

export const agentStatusDot: Record<string, string> = {
  running: "bg-emerald-400 animate-pulse",
  active: "bg-green-400",
  paused: "bg-yellow-400",
  idle: "bg-yellow-400",
  pending_approval: "bg-amber-400",
  error: "bg-red-400",
  archived: "bg-neutral-400",
};

export const agentStatusDotDefault = "bg-neutral-400";

// ---------------------------------------------------------------------------
// Priority colors
// ---------------------------------------------------------------------------

export const priorityColor: Record<string, string> = {
  critical: "text-red-600 dark:text-red-400",
  high: "text-orange-600 dark:text-orange-400",
  medium: "text-yellow-600 dark:text-yellow-400",
  low: "text-blue-600 dark:text-blue-400",
};

export const priorityColorDefault = "text-yellow-600 dark:text-yellow-400";

// ---------------------------------------------------------------------------
// Live / running indicator tokens — used everywhere a "live" state is shown
// (sidebar badges, agent dots, activity panels, kanban cards, etc.)
// Import these instead of hardcoding blue/cyan/indigo colors.
// ---------------------------------------------------------------------------

export const live = {
  /** Pulsing ping ring (animate-ping element) */
  ping: "bg-emerald-400",
  /** Solid indicator dot */
  dot: "bg-emerald-500",
  /** Text label ("Live", "N live", run count) */
  text: "text-emerald-600 dark:text-emerald-400",
  /** Hover text for links */
  textHover: "hover:text-emerald-500 dark:hover:text-emerald-300",
  /** Card border when active */
  border: "border-emerald-500/30",
  /** Card glow shadow when active */
  shadow: "shadow-[0_0_12px_rgba(16,185,129,0.08)]",
  /** Light background tint */
  bg: "bg-emerald-500/10",
} as const;
