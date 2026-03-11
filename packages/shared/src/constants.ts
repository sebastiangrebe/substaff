export const VENDOR_PLANS = ["free", "starter", "pro", "enterprise"] as const;
export type VendorPlan = (typeof VENDOR_PLANS)[number];

export const VENDOR_MEMBERSHIP_ROLES = ["owner", "admin", "member"] as const;
export type VendorMembershipRole = (typeof VENDOR_MEMBERSHIP_ROLES)[number];

export const TASK_PLAN_STATUSES = ["draft", "pending_review", "approved", "rejected"] as const;
export type TaskPlanStatus = (typeof TASK_PLAN_STATUSES)[number];

export const ORG_TEMPLATE_CATEGORIES = ["general", "marketing", "legal", "engineering", "support", "finance", "research"] as const;
export type OrgTemplateCategory = (typeof ORG_TEMPLATE_CATEGORIES)[number];

export const COMPANY_STATUSES = ["active", "paused", "archived"] as const;
export type CompanyStatus = (typeof COMPANY_STATUSES)[number];

export const DEPLOYMENT_MODES = ["authenticated"] as const;
export type DeploymentMode = (typeof DEPLOYMENT_MODES)[number];

export const AGENT_STATUSES = [
  "active",
  "paused",
  "idle",
  "running",
  "error",
  "pending_approval",
  "terminated",
] as const;
export type AgentStatus = (typeof AGENT_STATUSES)[number];

export const AGENT_ADAPTER_TYPES = ["e2b_sandbox", "process", "http"] as const;
export type AgentAdapterType = (typeof AGENT_ADAPTER_TYPES)[number];

export const AGENT_ROLES = [
  "ceo",
  "cto",
  "cmo",
  "cfo",
  "engineer",
  "designer",
  "pm",
  "qa",
  "devops",
  "researcher",
  "general",
  "manager",
  "specialist",
  "creator",
  "analyst",
  "executive",
  "support",
] as const;
export type AgentRole = (typeof AGENT_ROLES)[number];

export const AGENT_ICON_NAMES = [
  "bot",
  "cpu",
  "brain",
  "zap",
  "rocket",
  "code",
  "terminal",
  "shield",
  "eye",
  "search",
  "wrench",
  "hammer",
  "lightbulb",
  "sparkles",
  "star",
  "heart",
  "flame",
  "bug",
  "cog",
  "database",
  "globe",
  "lock",
  "mail",
  "message-square",
  "file-code",
  "git-branch",
  "package",
  "puzzle",
  "target",
  "wand",
  "atom",
  "circuit-board",
  "radar",
  "swords",
  "telescope",
  "microscope",
  "crown",
  "gem",
  "hexagon",
  "pentagon",
  "fingerprint",
] as const;
export type AgentIconName = (typeof AGENT_ICON_NAMES)[number];

export const ISSUE_STATUSES = [
  "backlog",
  "todo",
  "in_progress",
  "in_review",
  "done",
  "blocked",
  "cancelled",
] as const;
export type IssueStatus = (typeof ISSUE_STATUSES)[number];

export const ISSUE_PRIORITIES = ["critical", "high", "medium", "low"] as const;
export type IssuePriority = (typeof ISSUE_PRIORITIES)[number];

export const GOAL_LEVELS = ["company", "team", "agent", "task"] as const;
export type GoalLevel = (typeof GOAL_LEVELS)[number];

export const GOAL_STATUSES = ["planned", "active", "achieved", "cancelled"] as const;
export type GoalStatus = (typeof GOAL_STATUSES)[number];

export const PROJECT_STATUSES = [
  "backlog",
  "planned",
  "in_progress",
  "completed",
  "cancelled",
] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const PROJECT_COLORS = [
  "#6366f1", // indigo
  "#8b5cf6", // violet
  "#ec4899", // pink
  "#ef4444", // red
  "#f97316", // orange
  "#eab308", // yellow
  "#22c55e", // green
  "#14b8a6", // teal
  "#06b6d4", // cyan
  "#3b82f6", // blue
] as const;

export const APPROVAL_TYPES = ["hire_agent", "approve_ceo_strategy"] as const;
export type ApprovalType = (typeof APPROVAL_TYPES)[number];

export const APPROVAL_STATUSES = [
  "pending",
  "revision_requested",
  "approved",
  "rejected",
  "cancelled",
] as const;
export type ApprovalStatus = (typeof APPROVAL_STATUSES)[number];

export const SECRET_PROVIDERS = [
  "local_encrypted",
  "aws_secrets_manager",
  "gcp_secret_manager",
  "vault",
] as const;
export type SecretProvider = (typeof SECRET_PROVIDERS)[number];

export const STORAGE_PROVIDERS = ["s3"] as const;
export type StorageProvider = (typeof STORAGE_PROVIDERS)[number];

export const HEARTBEAT_INVOCATION_SOURCES = [
  "timer",
  "assignment",
  "on_demand",
  "automation",
] as const;
export type HeartbeatInvocationSource = (typeof HEARTBEAT_INVOCATION_SOURCES)[number];

export const WAKEUP_TRIGGER_DETAILS = ["manual", "ping", "callback", "system"] as const;
export type WakeupTriggerDetail = (typeof WAKEUP_TRIGGER_DETAILS)[number];

export const WAKEUP_REQUEST_STATUSES = [
  "queued",
  "deferred_issue_execution",
  "claimed",
  "coalesced",
  "skipped",
  "completed",
  "failed",
  "cancelled",
] as const;
export type WakeupRequestStatus = (typeof WAKEUP_REQUEST_STATUSES)[number];

export const HEARTBEAT_RUN_STATUSES = [
  "queued",
  "running",
  "succeeded",
  "failed",
  "cancelled",
  "timed_out",
] as const;
export type HeartbeatRunStatus = (typeof HEARTBEAT_RUN_STATUSES)[number];

export const LIVE_EVENT_TYPES = [
  "heartbeat.run.queued",
  "heartbeat.run.status",
  "heartbeat.run.event",
  "heartbeat.run.log",
  "agent.status",
  "activity.logged",
] as const;
export type LiveEventType = (typeof LIVE_EVENT_TYPES)[number];

export const PRINCIPAL_TYPES = ["user", "agent"] as const;
export type PrincipalType = (typeof PRINCIPAL_TYPES)[number];

export const MEMBERSHIP_STATUSES = ["pending", "active", "suspended"] as const;
export type MembershipStatus = (typeof MEMBERSHIP_STATUSES)[number];


export const INVITE_TYPES = ["company_join", "bootstrap_ceo"] as const;
export type InviteType = (typeof INVITE_TYPES)[number];

export const INVITE_JOIN_TYPES = ["human", "agent", "both"] as const;
export type InviteJoinType = (typeof INVITE_JOIN_TYPES)[number];

export const JOIN_REQUEST_TYPES = ["human", "agent"] as const;
export type JoinRequestType = (typeof JOIN_REQUEST_TYPES)[number];

export const JOIN_REQUEST_STATUSES = ["pending_approval", "approved", "rejected"] as const;
export type JoinRequestStatus = (typeof JOIN_REQUEST_STATUSES)[number];

export const PERMISSION_KEYS = [
  "agents:create",
  "users:invite",
  "users:manage_permissions",
  "tasks:assign",
  "tasks:assign_scope",
  "joins:approve",
] as const;
export type PermissionKey = (typeof PERMISSION_KEYS)[number];

export const CREDIT_TRANSACTION_TYPES = ["top_up", "usage_deduction", "adjustment", "refund"] as const;
export type CreditTransactionType = (typeof CREDIT_TRANSACTION_TYPES)[number];

/** Preset top-up amounts in cents. */
export const CREDIT_TOP_UP_AMOUNTS = [500, 1000, 2500, 5000, 10000] as const;

/** Default markup factor: 15000 basis points = 1.5x raw LLM cost. */
export const DEFAULT_MARKUP_BASIS_POINTS = 15000;

// ---------------------------------------------------------------------------
// Derived subset constants — single source of truth for filtered status groups
// ---------------------------------------------------------------------------

/** Issue statuses that represent open/active work (excludes done & cancelled). */
export const OPEN_ISSUE_STATUSES = ISSUE_STATUSES.filter(
  (s) => s !== "done" && s !== "cancelled",
) as unknown as readonly ["backlog", "todo", "in_progress", "in_review", "blocked"];

/** Heartbeat run statuses that represent terminal (finished) runs. */
export const TERMINAL_HEARTBEAT_RUN_STATUSES = ["succeeded", "failed", "cancelled", "timed_out"] as const;
export type TerminalHeartbeatRunStatus = (typeof TERMINAL_HEARTBEAT_RUN_STATUSES)[number];

/** Heartbeat run statuses that represent active (in-flight) runs. */
export const ACTIVE_HEARTBEAT_RUN_STATUSES = ["queued", "running"] as const;
export type ActiveHeartbeatRunStatus = (typeof ACTIVE_HEARTBEAT_RUN_STATUSES)[number];

/** Heartbeat run statuses that indicate failure. */
export const FAILED_HEARTBEAT_RUN_STATUSES = ["failed", "timed_out"] as const;
export type FailedHeartbeatRunStatus = (typeof FAILED_HEARTBEAT_RUN_STATUSES)[number];

/** Approval statuses that can be resolved (approved/rejected). */
export const ACTIONABLE_APPROVAL_STATUSES = ["pending", "revision_requested"] as const;
export type ActionableApprovalStatus = (typeof ACTIONABLE_APPROVAL_STATUSES)[number];

/** Priority sort order — index = sort rank (lower = higher priority). */
export const PRIORITY_SORT_ORDER: Record<string, number> = Object.fromEntries(
  ISSUE_PRIORITIES.map((p, i) => [p, i]),
);

// ---------------------------------------------------------------------------
// Role classification — single source of truth for IC vs leadership branching
// ---------------------------------------------------------------------------

export const ROLE_CLASSIFICATIONS = ["ic", "leadership"] as const;
export type RoleClassification = (typeof ROLE_CLASSIFICATIONS)[number];

/** Built-in roles classified as leadership (goal/project oversight, delegation, hiring). */
export const LEADERSHIP_ROLES: readonly AgentRole[] = ["ceo", "cto", "cmo", "cfo", "pm", "manager", "executive"];

/** Built-in roles classified as IC (task execution, no oversight duties). */
export const IC_ROLES: readonly AgentRole[] = ["engineer", "designer", "qa", "devops", "researcher", "general", "specialist", "creator", "analyst", "support"];

/** Classify a built-in role. Returns "ic" for unknown roles. */
export function classifyBuiltinRole(role: string): RoleClassification {
  return (LEADERSHIP_ROLES as readonly string[]).includes(role) ? "leadership" : "ic";
}

/** Display labels for built-in roles. */
export const BUILTIN_ROLE_LABELS: Record<string, string> = {
  ceo: "CEO", cto: "CTO", cmo: "CMO", cfo: "CFO",
  engineer: "Engineer", designer: "Designer", pm: "PM",
  qa: "QA", devops: "DevOps", researcher: "Researcher", general: "General",
  manager: "Manager", specialist: "Specialist", creator: "Creator",
  analyst: "Analyst", executive: "Executive", support: "Support",
};

/** Descriptions for built-in roles. */
export const BUILTIN_ROLE_DESCRIPTIONS: Record<string, string> = {
  ceo: "Chief Executive Officer — sets company strategy and oversees all operations",
  cto: "Chief Technology Officer — owns technical roadmap and architecture",
  cmo: "Chief Marketing Officer — leads marketing strategy and campaigns",
  cfo: "Chief Financial Officer — manages financial planning and budgets",
  engineer: "Software engineer — builds and maintains code",
  designer: "Designer — creates UI/UX designs and visual assets",
  pm: "Project Manager — coordinates projects, sprints, and stakeholders",
  qa: "QA — tests software and ensures quality",
  devops: "DevOps — manages CI/CD, infrastructure, and deployments",
  researcher: "Researcher — conducts research and analysis",
  general: "General purpose agent with no specialized role",
  manager: "Manager — oversees a team and coordinates work",
  specialist: "Specialist — domain expert in a specific area",
  creator: "Creator — produces content, documentation, or creative assets",
  analyst: "Analyst — analyzes data and produces insights",
  executive: "Executive — senior leadership with strategic oversight",
  support: "Support — handles support tasks and customer communication",
};
