import type { VendorPlan, VendorMembershipRole } from "../constants.js";

export interface Vendor {
  id: string;
  name: string;
  slug: string;
  billingEmail: string;
  stripeCustomerId: string | null;
  plan: VendorPlan;
  planTokenLimit: number;
  creditBalanceCents: number;
  markupBasisPoints: number;
  lowBalanceAlertCents: number;
  lastLowBalanceAlertAt: Date | null;
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

export interface CompanyTemplate {
  slug: string;
  name: string;
  description: string;
  industry: string;
  icon?: string;
  agents: Array<{
    id: string;
    role: string;
    name: string;
    title: string;
    reportsTo: string | null;
  }>;
  bootstrapTask?: { title: string; description: string };
}

export interface CompanyTemplatePreview extends CompanyTemplate {
  agentCount: number;
}

/** Mirrors Composio SDK's ToolKitItem shape */
export interface ComposioToolkit {
  slug: string;
  name: string;
  meta: {
    logo?: string;
    description?: string;
    categories?: { slug: string; name: string }[];
    appUrl?: string;
    toolsCount?: number;
  };
  isLocalToolkit: boolean;
  authSchemes?: string[];
  composioManagedAuthSchemes?: string[];
  noAuth?: boolean;
}

export interface IntegrationConnection {
  id: string;
  vendorId: string;
  companyId: string;
  provider: string;
  composioConnectedAccountId: string | null;
  config: Record<string, unknown> | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface IntegrationConnectionWithToolkit extends IntegrationConnection {
  toolkit: ComposioToolkit | null;
}
