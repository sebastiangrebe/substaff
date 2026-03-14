import { useMemo } from "react";
import { NavLink, useLocation } from "@/lib/router";
import { useQuery } from "@tanstack/react-query";
import {
  House,
  CircleDot,
  SquarePen,
  Users,
  Inbox,
} from "lucide-react";
import { useCompany } from "../context/CompanyContext";
import { useDialog } from "../context/DialogContext";
import { sharedQueries } from "../lib/queryKeys";
import { cn } from "../lib/utils";

interface MobileBottomNavProps {
  visible: boolean;
}

interface MobileNavLinkItem {
  type: "link";
  to: string;
  label: string;
  icon: typeof House;
  badge?: number;
}

interface MobileNavActionItem {
  type: "action";
  label: string;
  icon: typeof SquarePen;
  onClick: () => void;
}

type MobileNavItem = MobileNavLinkItem | MobileNavActionItem;

export function MobileBottomNav({ visible }: MobileBottomNavProps) {
  const location = useLocation();
  const { selectedCompanyId } = useCompany();
  const { openNewIssue } = useDialog();

  const { data: sidebarBadges } = useQuery(sharedQueries.sidebarBadges(selectedCompanyId!));

  const items = useMemo<MobileNavItem[]>(
    () => [
      { type: "link", to: "/dashboard", label: "Home", icon: House },
      { type: "link", to: "/issues", label: "Tasks", icon: CircleDot },
      { type: "action", label: "New", icon: SquarePen, onClick: () => openNewIssue() },
      { type: "link", to: "/agents/all", label: "Team", icon: Users },
      {
        type: "link",
        to: "/inbox",
        label: "Inbox",
        icon: Inbox,
        badge: sidebarBadges?.inbox,
      },
    ],
    [openNewIssue, sidebarBadges?.inbox],
  );

  return (
    <div
      className={cn(
        "fixed bottom-0 left-0 right-0 z-30 flex justify-center transition-transform duration-200 ease-out md:hidden",
        visible ? "translate-y-0" : "translate-y-full",
      )}
      style={{ paddingBottom: "calc(0.5rem + env(safe-area-inset-bottom, 0px))" }}
    >
      <nav
        className="flex items-center gap-1 px-2 h-14 rounded-2xl bg-card/95 backdrop-blur-lg border border-border shadow-lg shadow-black/5 dark:shadow-black/20"
        aria-label="Mobile navigation"
      >
        {items.map((item) => {
          if (item.type === "action") {
            const Icon = item.icon;
            return (
              <button
                key={item.label}
                type="button"
                onClick={item.onClick}
                className="flex flex-col items-center justify-center gap-0.5 rounded-xl px-4 py-1.5 text-[10px] font-medium text-muted-foreground hover:text-foreground transition-colors"
              >
                <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary text-primary-foreground">
                  <Icon className="h-4 w-4" />
                </div>
              </button>
            );
          }

          const Icon = item.icon;
          return (
            <NavLink
              key={item.label}
              to={item.to}
              className={({ isActive }) =>
                cn(
                  "relative flex min-w-0 flex-col items-center justify-center gap-0.5 rounded-xl px-3.5 py-1.5 text-[10px] font-medium transition-colors",
                  isActive
                    ? "text-primary"
                    : "text-muted-foreground hover:text-foreground",
                )
              }
            >
              {({ isActive }) => (
                <>
                  <span className="relative">
                    <Icon className={cn("h-5 w-5", isActive && "stroke-[2.3]")} />
                    {item.badge != null && item.badge > 0 && (
                      <span className="absolute -right-2.5 -top-1.5 rounded-full bg-red-500 text-white px-1 py-0.5 text-[9px] leading-none font-semibold min-w-[16px] text-center">
                        {item.badge > 99 ? "99+" : item.badge}
                      </span>
                    )}
                  </span>
                  <span className="truncate">{item.label}</span>
                </>
              )}
            </NavLink>
          );
        })}
      </nav>
    </div>
  );
}
