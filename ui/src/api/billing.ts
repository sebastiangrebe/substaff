import type { BillingInfo, CreditTransaction } from "@substaff/shared";
import { api } from "./client";

export const billingApi = {
  getMyBilling: () => api.get<BillingInfo & { vendorId: string }>("/billing/me"),

  getInfo: (vendorId: string) =>
    api.get<BillingInfo>(`/vendors/${vendorId}/billing`),

  getBalance: (vendorId: string) =>
    api.get<{
      creditBalanceCents: number;
      markupBasisPoints: number;
      monthlyLlmCostCents: number;
      monthlyPlatformCostCents: number;
      monthlyTokens: number;
    }>(`/vendors/${vendorId}/billing/balance`),

  getCreditHistory: (vendorId: string, limit = 50, offset = 0, companyId?: string) => {
    const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
    if (companyId) params.set("companyId", companyId);
    return api.get<CreditTransaction[]>(
      `/vendors/${vendorId}/billing/credits?${params.toString()}`,
    );
  },

  createTopUp: (vendorId: string, amountCents: number) =>
    api.post<{ url: string; sessionId: string }>(
      `/vendors/${vendorId}/billing/top-up`,
      { amountCents },
    ),

};
