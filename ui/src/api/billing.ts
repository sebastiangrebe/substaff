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

  getCreditHistory: (vendorId: string, limit = 50, offset = 0) =>
    api.get<CreditTransaction[]>(
      `/vendors/${vendorId}/billing/credits?limit=${limit}&offset=${offset}`,
    ),

  createTopUp: (vendorId: string, amountCents: number) =>
    api.post<{ url: string; sessionId: string }>(
      `/vendors/${vendorId}/billing/top-up`,
      { amountCents },
    ),

};
