import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "@/lib/router";
import { MutationCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { App } from "./App";
import { CompanyProvider } from "./context/CompanyContext";
import { LiveUpdatesProvider } from "./context/LiveUpdatesProvider";
import { BreadcrumbProvider } from "./context/BreadcrumbContext";
import { PanelProvider } from "./context/PanelContext";
import { DialogProvider } from "./context/DialogContext";
import { TourProvider } from "./components/Tour";
import { ToastProvider } from "./context/ToastContext";
import { ThemeProvider } from "./context/ThemeContext";
import { TooltipProvider } from "@/components/ui/tooltip";
import { BudgetExhaustedListener } from "./components/BudgetExhaustedListener";
import { ApiError } from "./api/client";
import "@mdxeditor/editor/style.css";
import "./index.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: true,
    },
  },
  mutationCache: new MutationCache({
    onError: (error) => {
      if (
        error instanceof ApiError &&
        error.status === 409 &&
        error.message.toLowerCase().includes("budget exhausted")
      ) {
        window.dispatchEvent(new CustomEvent("substaff:budget-exhausted"));
      }
    },
  }),
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <CompanyProvider>
          <ToastProvider>
            <BudgetExhaustedListener />
            <LiveUpdatesProvider>
              <BrowserRouter>
                <TooltipProvider>
                  <BreadcrumbProvider>
                    <PanelProvider>
                      <DialogProvider>
                        <TourProvider>
                          <App />
                        </TourProvider>
                      </DialogProvider>
                    </PanelProvider>
                  </BreadcrumbProvider>
                </TooltipProvider>
              </BrowserRouter>
            </LiveUpdatesProvider>
          </ToastProvider>
        </CompanyProvider>
      </ThemeProvider>
    </QueryClientProvider>
  </StrictMode>
);
