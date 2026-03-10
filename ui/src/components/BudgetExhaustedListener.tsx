import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "../context/ToastContext";
import { queryKeys } from "../lib/queryKeys";

export function BudgetExhaustedListener() {
  const { pushToast } = useToast();
  const queryClient = useQueryClient();

  useEffect(() => {
    function handler() {
      // Refresh billing data so sidebar badge updates
      void queryClient.invalidateQueries({ queryKey: queryKeys.billing.me });

      pushToast({
        title: "Credits depleted",
        body: "Your credit balance has run out. Top up to continue running agents.",
        tone: "error",
        dedupeKey: "budget-exhausted",
        action: { label: "Go to Billing", href: "/billing" },
      });
    }

    window.addEventListener("substaff:budget-exhausted", handler);
    return () => window.removeEventListener("substaff:budget-exhausted", handler);
  }, [pushToast, queryClient]);

  return null;
}
