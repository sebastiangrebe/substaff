import type { CompanyStatus } from "../constants.js";

export interface Company {
  id: string;
  vendorId: string;
  name: string;
  description: string | null;
  status: CompanyStatus;
  issuePrefix: string;
  issueCounter: number;
  budgetMonthlyCents: number;
  /** Platform cost with markup applied. Raw LLM cost is internal only. */
  platformSpentMonthlyCents: number;
  requirePlanApproval: boolean;
  requireHireApproval: boolean;
  orgChartData: unknown;
  brandColor: string | null;
  createdAt: Date;
  updatedAt: Date;
}
