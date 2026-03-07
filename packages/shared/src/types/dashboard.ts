export interface IssueCounts {
  total: number;
  done: number;
  inProgress: number;
  blocked: number;
  open: number;
}

export interface ProjectProgress {
  projectId: string;
  name: string;
  status: string;
  leadAgentId: string | null;
  issues: IssueCounts;
  completionPercent: number;
}

export interface GoalProgress {
  goalId: string;
  goalStatus: string;
  ownerAgentId: string | null;
  title: string;
  issues: IssueCounts;
  completionPercent: number;
  projects: ProjectProgress[];
}

export interface DashboardSummary {
  companyId: string;
  agents: {
    active: number;
    running: number;
    paused: number;
    error: number;
  };
  tasks: {
    open: number;
    inProgress: number;
    blocked: number;
    done: number;
  };
  costs: {
    monthSpendCents: number;
    monthBudgetCents: number;
    monthUtilizationPercent: number;
  };
  pendingApprovals: number;
  staleTasks: number;
  goals: GoalProgress[];
  projects: ProjectProgress[];
}
