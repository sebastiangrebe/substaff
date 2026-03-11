import type { RoleClassification } from "../constants.js";

export interface CompanyRole {
  id: string;
  companyId: string;
  slug: string;
  displayLabel: string;
  description: string | null;
  classification: RoleClassification;
  createdAt: Date;
  updatedAt: Date;
}

/** Unified role item returned by the roles list endpoint (built-in + custom). */
export interface RoleListItem {
  slug: string;
  displayLabel: string;
  description: string | null;
  classification: RoleClassification;
  source: "system" | "custom";
  /** Only present for custom roles. */
  id?: string;
  /** Number of agents using this role in the company. */
  agentCount: number;
}
