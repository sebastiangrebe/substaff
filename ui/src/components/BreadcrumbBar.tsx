import { Link } from "@/lib/router";
import { ChevronLeft, Menu } from "lucide-react";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { useSidebar } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";

export function BreadcrumbBar() {
  const { breadcrumbs } = useBreadcrumbs();
  const { toggleSidebar, isMobile } = useSidebar();

  // Mobile-only: hamburger menu
  if (isMobile) {
    const menuButton = (
      <Button
        variant="ghost"
        size="icon-sm"
        className="mr-2 shrink-0"
        onClick={toggleSidebar}
        aria-label="Open sidebar"
      >
        <Menu className="h-5 w-5" />
      </Button>
    );

    if (breadcrumbs.length <= 1) {
      return (
        <div className="px-4 py-2 shrink-0 flex items-center min-w-0 overflow-hidden">
          {menuButton}
        </div>
      );
    }

    const parent = breadcrumbs[breadcrumbs.length - 2]!;
    return (
      <div className="px-4 py-2 shrink-0 flex items-center min-w-0 overflow-hidden">
        {menuButton}
        {parent.href ? (
          <Link
            to={parent.href}
            className="inline-flex items-center gap-1.5 text-lg font-semibold text-foreground hover:text-foreground/80 transition-colors no-underline"
          >
            <ChevronLeft className="h-4 w-4 text-muted-foreground" />
            <span>{parent.label}</span>
          </Link>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-lg font-semibold text-foreground">
            <ChevronLeft className="h-4 w-4 text-muted-foreground" />
            <span>{parent.label}</span>
          </span>
        )}
      </div>
    );
  }

  // Desktop: only render for multi-level breadcrumbs, no extra padding (inside <main>)
  if (breadcrumbs.length <= 1) return null;

  const parent = breadcrumbs[breadcrumbs.length - 2]!;

  return (
    <div className="mb-4 flex items-center min-w-0 overflow-hidden">
      {parent.href ? (
        <Link
          to={parent.href}
          className="inline-flex items-center gap-1.5 text-lg font-semibold text-foreground hover:text-foreground/80 transition-colors no-underline"
        >
          <ChevronLeft className="h-4 w-4 text-muted-foreground" />
          <span>{parent.label}</span>
        </Link>
      ) : (
        <span className="inline-flex items-center gap-1.5 text-lg font-semibold text-foreground">
          <ChevronLeft className="h-4 w-4 text-muted-foreground" />
          <span>{parent.label}</span>
        </span>
      )}
    </div>
  );
}
