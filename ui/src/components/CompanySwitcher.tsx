import { useMemo, useState } from "react";
import { Check, ChevronsUpDown, Plus } from "lucide-react";
import { useCompany } from "../context/CompanyContext";
import { useDialog } from "../context/DialogContext";
import { cn } from "../lib/utils";
import { CompanyPatternIcon } from "./CompanyPatternIcon";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useQueries } from "@tanstack/react-query";
import { sharedQueries } from "../lib/queryKeys";
import type { Company } from "@substaff/shared";

export function CompanySwitcher() {
  const { companies, selectedCompanyId, setSelectedCompanyId, selectedCompany } = useCompany();
  const { openOnboarding } = useDialog();
  const [isOpen, setIsOpen] = useState(false);

  const sidebarCompanies = useMemo(
    () => companies.filter((c) => c.status !== "archived"),
    [companies],
  );
  // Only fetch non-selected companies when dropdown is open
  const companyIds = useMemo(
    () => sidebarCompanies.map((c) => c.id).filter((id) => id !== selectedCompanyId),
    [sidebarCompanies, selectedCompanyId],
  );

  const liveRunsQueries = useQueries({
    queries: companyIds.map((companyId) => ({
      ...sharedQueries.liveRuns(companyId),
      enabled: isOpen,
    })),
  });
  const sidebarBadgeQueries = useQueries({
    queries: companyIds.map((companyId) => ({
      ...sharedQueries.sidebarBadges(companyId),
      enabled: isOpen,
    })),
  });

  const liveByCompany = useMemo(() => {
    const m = new Map<string, number>();
    companyIds.forEach((id, i) => m.set(id, liveRunsQueries[i]?.data?.length ?? 0));
    return m;
  }, [companyIds, liveRunsQueries]);

  const inboxByCompany = useMemo(() => {
    const m = new Map<string, number>();
    companyIds.forEach((id, i) => m.set(id, sidebarBadgeQueries[i]?.data?.inbox ?? 0));
    return m;
  }, [companyIds, sidebarBadgeQueries]);

  return (
    <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
      <DropdownMenuTrigger asChild>
        <button
          className="flex items-center gap-2.5 w-full px-2 py-2 rounded-md hover:bg-sidebar-accent/60 transition-colors text-left outline-none"
          aria-label="Switch workspace"
        >
          {selectedCompany && (
            <CompanyPatternIcon
              companyName={selectedCompany.name}
              brandColor={selectedCompany.brandColor}
              className="w-8 h-8 rounded-lg text-sm shrink-0"
            />
          )}
          <span className="flex-1 min-w-0 text-sm font-semibold text-foreground truncate">
            {selectedCompany?.name ?? "Select workspace"}
          </span>
          <ChevronsUpDown className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64" sideOffset={4}>
        {sidebarCompanies.map((company: Company) => {
          const isSelected = company.id === selectedCompanyId;
          const liveCount = liveByCompany.get(company.id) ?? 0;
          const inboxCount = inboxByCompany.get(company.id) ?? 0;
          return (
            <DropdownMenuItem
              key={company.id}
              onClick={() => setSelectedCompanyId(company.id)}
              className={cn(
                "flex items-center gap-2.5 px-2.5 py-2 cursor-pointer",
                isSelected && "bg-accent",
              )}
            >
              <CompanyPatternIcon
                companyName={company.name}
                brandColor={company.brandColor}
                className="w-7 h-7 rounded-md text-xs shrink-0"
              />
              <span className="flex-1 truncate font-medium">{company.name}</span>
              {liveCount > 0 && (
                <span className="flex items-center gap-1 shrink-0">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500" />
                  </span>
                </span>
              )}
              {inboxCount > 0 && (
                <span className="rounded-full bg-red-500 text-white text-[10px] leading-none px-1.5 py-0.5 shrink-0">
                  {inboxCount > 99 ? "99+" : inboxCount}
                </span>
              )}
              {isSelected && <Check className="h-4 w-4 text-primary shrink-0" />}
            </DropdownMenuItem>
          );
        })}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => openOnboarding()}
          className="flex items-center gap-2.5 px-2.5 py-2 text-muted-foreground cursor-pointer"
        >
          <Plus className="h-4 w-4" />
          <span>Add company</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
