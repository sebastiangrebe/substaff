import { useCallback, useMemo, useState } from "react";
import { NavLink, useLocation } from "@/lib/router";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, FolderKanban, Plus } from "lucide-react";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  type DragEndEvent,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useCompany } from "../context/CompanyContext";
import { useDialog } from "../context/DialogContext";
import { useSidebar, SidebarMenuButton, SidebarMenuSub, SidebarMenuSubItem, SidebarMenuSubButton } from "@/components/ui/sidebar";
import { authApi } from "../api/auth";
import { projectsApi } from "../api/projects";
import { queryKeys } from "../lib/queryKeys";
import { cn, projectRouteRef } from "../lib/utils";
import { useProjectOrder } from "../hooks/useProjectOrder";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import type { Project } from "@substaff/shared";

function SortableProjectItem({
  activeProjectRef,
  isMobile,
  project,
  setOpenMobile,
}: {
  activeProjectRef: string | null;
  isMobile: boolean;
  project: Project;
  setOpenMobile: (open: boolean) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: project.id });

  const routeRef = projectRouteRef(project);

  return (
    <SidebarMenuSubItem
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 10 : undefined,
      }}
      className={cn(isDragging && "opacity-80")}
      {...attributes}
      {...listeners}
    >
      <SidebarMenuSubButton asChild isActive={activeProjectRef === routeRef || activeProjectRef === project.id}>
        <NavLink
          to={`/projects/${routeRef}/issues`}
          onClick={() => { if (isMobile) setOpenMobile(false); }}
        >
          <span
            className="shrink-0 h-3.5 w-3.5 rounded-sm"
            style={{ backgroundColor: project.color ?? "#6366f1" }}
          />
          <span className="truncate">{project.name}</span>
        </NavLink>
      </SidebarMenuSubButton>
    </SidebarMenuSubItem>
  );
}

export function SidebarProjects() {
  const [open, setOpen] = useState(false);
  const { selectedCompanyId } = useCompany();
  const { openNewProject } = useDialog();
  const { isMobile, setOpenMobile } = useSidebar();
  const location = useLocation();

  const { data: projects } = useQuery({
    queryKey: queryKeys.projects.list(selectedCompanyId!),
    queryFn: () => projectsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });
  const { data: session } = useQuery({
    queryKey: queryKeys.auth.session,
    queryFn: () => authApi.getSession(),
  });

  const currentUserId = session?.user?.id ?? session?.session?.userId ?? null;

  const visibleProjects = useMemo(
    () => (projects ?? []).filter((project: Project) => !project.archivedAt),
    [projects],
  );
  const { orderedProjects, persistOrder } = useProjectOrder({
    projects: visibleProjects,
    companyId: selectedCompanyId,
    userId: currentUserId,
  });

  const projectMatch = location.pathname.match(/^\/(?:[^/]+\/)?projects\/([^/]+)/);
  const activeProjectRef = projectMatch?.[1] ?? null;
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      const ids = orderedProjects.map((project) => project.id);
      const oldIndex = ids.indexOf(active.id as string);
      const newIndex = ids.indexOf(over.id as string);
      if (oldIndex === -1 || newIndex === -1) return;

      persistOrder(arrayMove(ids, oldIndex, newIndex));
    },
    [orderedProjects, persistOrder],
  );

  const projectsActive = /^\/(?:[^/]+\/)?projects(\/|$)/.test(location.pathname);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className="flex items-center">
        <SidebarMenuButton asChild tooltip="Projects" className="flex-1 min-w-0">
          <NavLink
            to="/projects"
            onClick={() => { if (isMobile) setOpenMobile(false); }}
          >
            <FolderKanban className="h-4 w-4 shrink-0" />
            <span className="flex-1 truncate">Projects</span>
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
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={orderedProjects.map((project) => project.id)}
            strategy={verticalListSortingStrategy}
          >
            <SidebarMenuSub>
              {orderedProjects.map((project: Project) => (
                <SortableProjectItem
                  key={project.id}
                  activeProjectRef={activeProjectRef}
                  isMobile={isMobile}
                  project={project}
                  setOpenMobile={setOpenMobile}
                />
              ))}
              <SidebarMenuSubItem>
                <SidebarMenuSubButton asChild>
                  <button
                    onClick={() => openNewProject()}
                    className="text-muted-foreground"
                  >
                    <Plus className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">New Project</span>
                  </button>
                </SidebarMenuSubButton>
              </SidebarMenuSubItem>
            </SidebarMenuSub>
          </SortableContext>
        </DndContext>
      </CollapsibleContent>
    </Collapsible>
  );
}
