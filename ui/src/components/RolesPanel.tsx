import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { RoleListItem } from "@substaff/shared";
import { companyRolesApi } from "../api/companyRoles";
import { useCompany } from "../context/CompanyContext";
import { queryKeys } from "../lib/queryKeys";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { EmptyState } from "./EmptyState";
import { PageSkeleton } from "./PageSkeleton";
import { Shield, Plus, Pencil, Trash2, AlertTriangle } from "lucide-react";
import { cn } from "../lib/utils";

function slugify(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .replace(/_+/g, "_") || "role";
}

interface RoleFormData {
  slug: string;
  displayLabel: string;
  description: string;
  classification: "ic" | "leadership";
}

const emptyForm: RoleFormData = { slug: "", displayLabel: "", description: "", classification: "ic" };

function RoleFormDialog({
  open,
  onOpenChange,
  initialData,
  mode,
  onSubmit,
  isPending,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialData: RoleFormData;
  mode: "create" | "edit";
  onSubmit: (data: RoleFormData) => void;
  isPending: boolean;
}) {
  const [form, setForm] = useState<RoleFormData>(initialData);
  const [autoSlug, setAutoSlug] = useState(mode === "create");

  function handleLabelChange(label: string) {
    setForm((prev) => ({
      ...prev,
      displayLabel: label,
      ...(autoSlug ? { slug: slugify(label) } : {}),
    }));
  }

  function handleSlugChange(slug: string) {
    setAutoSlug(false);
    setForm((prev) => ({ ...prev, slug }));
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{mode === "create" ? "Create Custom Role" : "Edit Role"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Display Label</label>
            <Input
              value={form.displayLabel}
              onChange={(e) => handleLabelChange(e.target.value)}
              placeholder="e.g. Tech Lead"
              autoFocus
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Slug</label>
            <Input
              value={form.slug}
              onChange={(e) => handleSlugChange(e.target.value)}
              placeholder="e.g. tech_lead"
              disabled={mode === "edit"}
              className={cn(mode === "edit" && "opacity-60")}
            />
            <p className="text-[10px] text-muted-foreground/60 mt-1">Lowercase, underscores only. Used in API and config.</p>
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Description</label>
            <Input
              value={form.description}
              onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
              placeholder="What does this role do?"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Classification</label>
            <div className="flex gap-2">
              <button
                type="button"
                className={cn(
                  "flex-1 rounded-md border px-3 py-1.5 text-xs transition-colors",
                  form.classification === "ic"
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:bg-accent/50",
                )}
                onClick={() => setForm((prev) => ({ ...prev, classification: "ic" }))}
              >
                IC (Individual Contributor)
              </button>
              <button
                type="button"
                className={cn(
                  "flex-1 rounded-md border px-3 py-1.5 text-xs transition-colors",
                  form.classification === "leadership"
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:bg-accent/50",
                )}
                onClick={() => setForm((prev) => ({ ...prev, classification: "leadership" }))}
              >
                Leadership
              </button>
            </div>
            <p className="text-[10px] text-muted-foreground/60 mt-1">
              Leadership roles get goal/project oversight duties. IC roles focus on task execution.
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            size="sm"
            disabled={!form.displayLabel.trim() || !form.slug.trim() || isPending}
            onClick={() => onSubmit(form)}
          >
            {isPending ? "Saving…" : mode === "create" ? "Create Role" : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeleteConfirmDialog({
  open,
  onOpenChange,
  role,
  onConfirm,
  isPending,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  role: RoleListItem | null;
  onConfirm: () => void;
  isPending: boolean;
}) {
  if (!role) return null;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Delete Role</DialogTitle>
        </DialogHeader>
        <div className="py-2 space-y-2">
          <p className="text-sm">
            Delete <span className="font-medium">{role.displayLabel}</span>?
          </p>
          {role.agentCount > 0 && (
            <div className="flex items-start gap-2 rounded-md border border-yellow-500/30 bg-yellow-500/5 p-2.5">
              <AlertTriangle className="h-4 w-4 text-yellow-500 shrink-0 mt-0.5" />
              <p className="text-xs text-yellow-200/80">
                {role.agentCount} agent{role.agentCount > 1 ? "s" : ""} still use this role.
                They will keep it but it will appear as unrecognized.
              </p>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="destructive" size="sm" disabled={isPending} onClick={onConfirm}>
            {isPending ? "Deleting…" : "Delete"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function RolesPanel() {
  const { selectedCompanyId } = useCompany();
  const queryClient = useQueryClient();

  const [createOpen, setCreateOpen] = useState(false);
  const [editRole, setEditRole] = useState<RoleListItem | null>(null);
  const [deleteRole, setDeleteRole] = useState<RoleListItem | null>(null);

  const { data: roles, isLoading } = useQuery({
    queryKey: queryKeys.roles.list(selectedCompanyId!),
    queryFn: () => companyRolesApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.roles.list(selectedCompanyId!) });
  };

  const createMutation = useMutation({
    mutationFn: (data: RoleFormData) =>
      companyRolesApi.create(selectedCompanyId!, {
        slug: data.slug,
        displayLabel: data.displayLabel,
        description: data.description || null,
        classification: data.classification,
      }),
    onSuccess: () => { invalidate(); setCreateOpen(false); },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: RoleFormData }) =>
      companyRolesApi.update(selectedCompanyId!, id, {
        displayLabel: data.displayLabel,
        description: data.description || null,
        classification: data.classification,
      }),
    onSuccess: () => { invalidate(); setEditRole(null); },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => companyRolesApi.remove(selectedCompanyId!, id),
    onSuccess: () => { invalidate(); setDeleteRole(null); },
  });

  if (isLoading) return <PageSkeleton variant="list" />;

  const systemRoles = (roles ?? []).filter((r) => r.source === "system");
  const customRoles = (roles ?? []).filter((r) => r.source === "custom");

  return (
    <div className="space-y-6">
      {/* Custom Roles */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold">Custom Roles</h3>
          <Button size="sm" variant="outline" onClick={() => setCreateOpen(true)}>
            <Plus className="h-3.5 w-3.5 mr-1.5" />
            Create Role
          </Button>
        </div>
        {customRoles.length === 0 ? (
          <EmptyState
            icon={Shield}
            message="No custom roles defined. Create one to use in agent creation."
          />
        ) : (
          <div className="border border-border/50 rounded-lg divide-y divide-border/50">
            {customRoles.map((role) => (
              <div key={role.id} className="flex items-center gap-3 px-3 py-2">
                <Shield className="h-3.5 w-3.5 text-primary/60 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{role.displayLabel}</span>
                    <span className="text-xs font-mono text-muted-foreground/60">{role.slug}</span>
                  </div>
                  {role.description && (
                    <p className="text-xs text-muted-foreground truncate">{role.description}</p>
                  )}
                </div>
                <Badge variant="outline" className="text-[10px] shrink-0">
                  {role.classification}
                </Badge>
                {role.agentCount > 0 && (
                  <span className="text-xs text-muted-foreground tabular-nums">{role.agentCount} agent{role.agentCount !== 1 ? "s" : ""}</span>
                )}
                <div className="flex items-center gap-0.5 shrink-0">
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    className="text-muted-foreground hover:text-foreground"
                    onClick={() => setEditRole(role)}
                  >
                    <Pencil className="h-3 w-3" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    className="text-muted-foreground hover:text-destructive"
                    onClick={() => setDeleteRole(role)}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* System Roles */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold">System Roles</h3>
          <span className="text-xs text-muted-foreground">{systemRoles.length} built-in</span>
        </div>
        <div className="border border-border/50 rounded-lg divide-y divide-border/50">
          {systemRoles.map((role) => (
            <div key={role.slug} className="flex items-center gap-3 px-3 py-2">
              <Shield className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{role.displayLabel}</span>
                  <span className="text-xs font-mono text-muted-foreground/60">{role.slug}</span>
                </div>
                {role.description && (
                  <p className="text-xs text-muted-foreground truncate">{role.description}</p>
                )}
              </div>
              <Badge variant="outline" className="text-[10px] shrink-0">
                {role.classification}
              </Badge>
              {role.agentCount > 0 && (
                <span className="text-xs text-muted-foreground tabular-nums">{role.agentCount} agent{role.agentCount !== 1 ? "s" : ""}</span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Create Dialog */}
      <RoleFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        initialData={emptyForm}
        mode="create"
        onSubmit={(data) => createMutation.mutate(data)}
        isPending={createMutation.isPending}
      />

      {/* Edit Dialog */}
      {editRole && (
        <RoleFormDialog
          open={!!editRole}
          onOpenChange={(open) => { if (!open) setEditRole(null); }}
          initialData={{
            slug: editRole.slug,
            displayLabel: editRole.displayLabel,
            description: editRole.description ?? "",
            classification: editRole.classification,
          }}
          mode="edit"
          onSubmit={(data) => updateMutation.mutate({ id: editRole.id!, data })}
          isPending={updateMutation.isPending}
        />
      )}

      {/* Delete Dialog */}
      <DeleteConfirmDialog
        open={!!deleteRole}
        onOpenChange={(open) => { if (!open) setDeleteRole(null); }}
        role={deleteRole}
        onConfirm={() => deleteRole?.id && deleteMutation.mutate(deleteRole.id)}
        isPending={deleteMutation.isPending}
      />
    </div>
  );
}
