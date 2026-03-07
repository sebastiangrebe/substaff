import type { VendorPlan, VendorMembershipRole } from "../constants.js";

export interface Vendor {
  id: string;
  name: string;
  slug: string;
  billingEmail: string;
  stripeCustomerId: string | null;
  plan: VendorPlan;
  planTokenLimit: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface VendorMembership {
  id: string;
  vendorId: string;
  userId: string;
  role: VendorMembershipRole;
  createdAt: Date;
  updatedAt: Date;
}

export interface VendorUsage {
  id: string;
  vendorId: string;
  periodStart: Date;
  periodEnd: Date;
  totalTokensUsed: number;
  totalCostCents: number;
  planLimit: number;
  hardCapReached: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface TaskPlan {
  id: string;
  companyId: string;
  issueId: string;
  agentId: string;
  planMarkdown: string;
  status: string;
  version: number;
  reviewerComments: unknown;
  approvedByUserId: string | null;
  createdAt: Date;
  approvedAt: Date | null;
  updatedAt: Date;
}

export interface OrgTemplate {
  id: string;
  vendorId: string | null;
  name: string;
  slug: string;
  description: string | null;
  category: string;
  templateData: unknown;
  isBuiltin: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface IntegrationConnection {
  id: string;
  vendorId: string;
  companyId: string;
  provider: string;
  scopes: string | null;
  expiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
