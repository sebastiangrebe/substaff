import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router-dom";
import { MutationCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { routes } from "./App";
import { createAppRouter } from "./lib/router";
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
import { AppErrorBoundary } from "./components/ErrorBoundary";
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

const router = createAppRouter(routes);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <CompanyProvider>
          <ToastProvider>
            <BudgetExhaustedListener />
            <LiveUpdatesProvider>
              <TooltipProvider>
                <BreadcrumbProvider>
                  <PanelProvider>
                    <DialogProvider>
                      <TourProvider>
                        <AppErrorBoundary>
                          <RouterProvider router={router} />
                        </AppErrorBoundary>
                      </TourProvider>
                    </DialogProvider>
                  </PanelProvider>
                </BreadcrumbProvider>
              </TooltipProvider>
            </LiveUpdatesProvider>
          </ToastProvider>
        </CompanyProvider>
      </ThemeProvider>
    </QueryClientProvider>
  </StrictMode>
);
