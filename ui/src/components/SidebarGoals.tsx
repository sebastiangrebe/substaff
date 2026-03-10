import { useMemo, useState } from "react";
import { NavLink, useLocation } from "@/lib/router";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, Plus, Target } from "lucide-react";
import { useCompany } from "../context/CompanyContext";
import { useDialog } from "../context/DialogContext";
import { useSidebar, SidebarMenuButton, SidebarMenuSub, SidebarMenuSubItem, SidebarMenuSubButton } from "@/components/ui/sidebar";
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
  const { isMobile, setOpenMobile } = useSidebar();
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
        <SidebarMenuButton asChild tooltip="Goals" className="flex-1 min-w-0">
          <NavLink
            to="/goals"
            onClick={() => { if (isMobile) setOpenMobile(false); }}
          >
            <Target className="h-4 w-4 shrink-0" />
            <span className="flex-1 truncate">Goals</span>
          </NavLink>
        </SidebarMenuButton>
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
        <SidebarMenuSub>
          {visibleGoals.map((goal: Goal) => (
            <SidebarMenuSubItem key={goal.id}>
              <SidebarMenuSubButton asChild isActive={activeGoalId === goal.id}>
                <NavLink
                  to={`/goals/${goal.id}`}
                  onClick={() => { if (isMobile) setOpenMobile(false); }}
                >
                  <span className="truncate">{goal.title}</span>
                </NavLink>
              </SidebarMenuSubButton>
            </SidebarMenuSubItem>
          ))}
          {openNewGoal && (
            <SidebarMenuSubItem>
              <SidebarMenuSubButton asChild>
                <button
                  onClick={() => openNewGoal()}
                  className="text-muted-foreground"
                >
                  <Plus className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">New Goal</span>
                </button>
              </SidebarMenuSubButton>
            </SidebarMenuSubItem>
          )}
        </SidebarMenuSub>
      </CollapsibleContent>
    </Collapsible>
  );
}
