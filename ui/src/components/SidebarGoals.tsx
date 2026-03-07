import { useMemo, useState } from "react";
import { NavLink, useLocation } from "@/lib/router";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, Plus, Target } from "lucide-react";
import { useCompany } from "../context/CompanyContext";
import { useDialog } from "../context/DialogContext";
import { useSidebar } from "../context/SidebarContext";
import { goalsApi } from "../api/goals";
import { queryKeys } from "../lib/queryKeys";
import { cn } from "../lib/utils";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import type { Goal } from "@substaff/shared";

export function SidebarGoals() {
  const [open, setOpen] = useState(false);
  const { selectedCompanyId } = useCompany();
  const { openNewGoal } = useDialog();
  const { isMobile, setSidebarOpen } = useSidebar();
  const location = useLocation();

  const { data: goals } = useQuery({
    queryKey: queryKeys.goals.list(selectedCompanyId!),
    queryFn: () => goalsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const visibleGoals = useMemo(
    () => (goals ?? []).filter((g: Goal) => g.status !== "cancelled"),
    [goals],
  );

  const goalsActive = /^\/(?:[^/]+\/)?goals(\/|$)/.test(location.pathname);
  const goalMatch = location.pathname.match(/^\/(?:[^/]+\/)?goals\/([^/]+)/);
  const activeGoalId = goalMatch?.[1] ?? null;

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className="flex items-center">
        <NavLink
          to="/goals"
          onClick={() => { if (isMobile) setSidebarOpen(false); }}
          className={cn(
            "flex items-center gap-2.5 px-3 py-2 text-[13px] font-medium transition-colors flex-1 min-w-0",
            goalsActive
              ? "bg-accent text-foreground"
              : "text-foreground/80 hover:bg-accent/50 hover:text-foreground",
          )}
        >
          <Target className="h-4 w-4 shrink-0" />
          <span className="flex-1 truncate">Goals</span>
        </NavLink>
        <CollapsibleTrigger className="flex items-center justify-center h-8 w-8 shrink-0 text-muted-foreground/60 hover:text-foreground transition-colors">
          <ChevronRight
            className={cn(
              "h-3 w-3 transition-transform",
              open && "rotate-90"
            )}
          />
        </CollapsibleTrigger>
      </div>

      <CollapsibleContent>
        <div className="flex flex-col gap-0.5 mt-0.5 pl-4">
          {visibleGoals.map((goal: Goal) => (
            <NavLink
              key={goal.id}
              to={`/goals/${goal.id}`}
              onClick={() => {
                if (isMobile) setSidebarOpen(false);
              }}
              className={cn(
                "flex items-center gap-2.5 px-3 py-1.5 text-[13px] font-medium transition-colors",
                activeGoalId === goal.id
                  ? "bg-accent text-foreground"
                  : "text-foreground/80 hover:bg-accent/50 hover:text-foreground",
              )}
            >
              <span className="flex-1 truncate">{goal.title}</span>
            </NavLink>
          ))}
          {openNewGoal && (
            <button
              onClick={() => openNewGoal()}
              className="flex items-center gap-2.5 px-3 py-1.5 text-[13px] font-medium text-muted-foreground hover:bg-accent/50 hover:text-foreground transition-colors"
            >
              <Plus className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">New Goal</span>
            </button>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
