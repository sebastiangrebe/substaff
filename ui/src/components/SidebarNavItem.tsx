import { NavLink, useLocation } from "@/lib/router";
import { cn } from "../lib/utils";
import { useSidebar, SidebarMenuButton } from "@/components/ui/sidebar";
import { useCompany } from "@/context/CompanyContext";
import { applyCompanyPrefix, normalizeCompanyPrefix } from "@/lib/company-routes";
import type { LucideIcon } from "lucide-react";

interface SidebarNavItemProps {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
  className?: string;
  badge?: number;
  badgeTone?: "default" | "danger";
  alert?: boolean;
  liveCount?: number;
  id?: string;
}

export function SidebarNavItem({
  to,
  label,
  icon: Icon,
  end,
  className,
  badge,
  badgeTone = "default",
  alert = false,
  liveCount,
  id,
}: SidebarNavItemProps) {
  const { isMobile, setOpenMobile } = useSidebar();
  const location = useLocation();
  const { selectedCompany } = useCompany();

  // Compute active state matching React Router's NavLink logic
  const companyPrefix = selectedCompany ? normalizeCompanyPrefix(selectedCompany.issuePrefix) : null;
  const resolvedPath = applyCompanyPrefix(to, companyPrefix);
  const isActive = end
    ? location.pathname === resolvedPath
    : location.pathname.startsWith(resolvedPath);

  return (
    <SidebarMenuButton asChild tooltip={label} isActive={isActive} className={className}>
      <NavLink
        id={id}
        to={to}
        end={end}
        onClick={() => { if (isMobile) setOpenMobile(false); }}
      >
        <span className="relative shrink-0">
          <Icon className="h-4 w-4" />
          {alert && (
            <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-red-500 shadow-[0_0_0_2px_hsl(var(--sidebar))]" />
          )}
        </span>
        <span className="flex-1 truncate">{label}</span>
        {liveCount != null && liveCount > 0 && (
          <span className="ml-auto flex items-center gap-1.5">
            <span className="relative flex h-4 w-4 items-center justify-center">
              <span className="animate-ping absolute inline-flex h-2 w-2 rounded-full bg-blue-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500" />
            </span>
            <span className="text-xs font-medium text-blue-600 dark:text-blue-400">{liveCount} live</span>
          </span>
        )}
        {badge != null && badge > 0 && (
          <span
            className={cn(
              "ml-auto rounded-full px-1.5 py-0.5 text-xs leading-none",
              badgeTone === "danger"
                ? "bg-red-600/90 text-red-50"
                : "bg-primary text-primary-foreground",
            )}
          >
            {badge}
          </span>
        )}
      </NavLink>
    </SidebarMenuButton>
  );
}
