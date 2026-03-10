export interface CostEvent {
  id: string;
  companyId: string;
  agentId: string;
  issueId: string | null;
  projectId: string | null;
  goalId: string | null;
  billingCode: string | null;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costCents: number;
  platformCostCents: number;
  occurredAt: Date;
  createdAt: Date;
}

export interface CostSummary {
  companyId: string;
  spendCents: number;
  platformSpendCents: number;
  budgetCents: number;
  utilizationPercent: number;
}

export interface CostByAgent {
  agentId: string;
  agentName: string | null;
  agentStatus: string | null;
  costCents: number;
  platformCostCents: number;
  inputTokens: number;
  outputTokens: number;
  apiRunCount: number;
  subscriptionRunCount: number;
  subscriptionInputTokens: number;
  subscriptionOutputTokens: number;
}

export interface CostByProject {
  projectId: string;
  projectName: string;
  costCents: number;
  platformCostCents: number;
  inputTokens: number;
  outputTokens: number;
}

export type CreditTransactionType = "top_up" | "usage_deduction" | "adjustment" | "refund";

export interface CreditTransaction {
  id: string;
  vendorId: string;
  type: CreditTransactionType;
  amountCents: number;
  balanceAfterCents: number;
  stripeSessionId: string | null;
  costEventId: string | null;
  description: string | null;
  createdAt: Date;
}

export interface BillingInfo {
  creditBalanceCents: number;
  markupBasisPoints: number;
  billingEmail: string;
  stripeCustomerId: string | null;
  usedCostCents: number;
  platformCostCents: number;
}
