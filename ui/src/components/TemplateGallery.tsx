import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Building2,
  Code2,
  Megaphone,
  Scale,
  Headphones,
  BarChart3,
  Users,
  ArrowRight,
  Check,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useCompany } from "../context/CompanyContext";
import { templatesApi, type OrgTemplateDetail } from "../api/templates";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

const industryIcons: Record<string, LucideIcon> = {
  Technology: Code2,
  Marketing: Megaphone,
  Legal: Scale,
  "Customer Service": Headphones,
  "Data & AI": BarChart3,
};

const industryColors: Record<string, string> = {
  Technology: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  Marketing: "bg-orange-500/10 text-orange-600 dark:text-orange-400",
  Legal: "bg-purple-500/10 text-purple-600 dark:text-purple-400",
  "Customer Service": "bg-green-500/10 text-green-600 dark:text-green-400",
  "Data & AI": "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400",
};

export function TemplateGallery() {
  const { selectedCompanyId } = useCompany();
  const queryClient = useQueryClient();
  const [previewTemplate, setPreviewTemplate] = useState<OrgTemplateDetail | null>(null);
  const [createAgents, setCreateAgents] = useState(false);
  const [applied, setApplied] = useState<string | null>(null);

  const { data: templates = [], isLoading } = useQuery({
    queryKey: ["templates"],
    queryFn: () => templatesApi.list(),
  });

  const applyMutation = useMutation({
    mutationFn: ({
      companyId,
      templateId,
      withAgents,
    }: {
      companyId: string;
      templateId: string;
      withAgents: boolean;
    }) => templatesApi.apply(companyId, templateId, withAgents),
    onSuccess: (_data, variables) => {
      setApplied(variables.templateId);
      setPreviewTemplate(null);
      queryClient.invalidateQueries({ queryKey: ["companies"] });
      queryClient.invalidateQueries({ queryKey: ["agents"] });
    },
  });

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="rounded-lg border border-border/50 bg-card p-5 animate-pulse">
            <div className="h-4 bg-muted rounded w-2/3 mb-3" />
            <div className="h-3 bg-muted rounded w-full mb-2" />
            <div className="h-3 bg-muted rounded w-4/5" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {templates.map((template) => {
          const Icon = industryIcons[template.industry] ?? Building2;
          const colorClass = industryColors[template.industry] ?? "bg-muted text-muted-foreground";
          const isApplied = applied === template.id;

          return (
            <button
              key={template.id}
              type="button"
              onClick={() => {
                setPreviewTemplate(template);
                setCreateAgents(false);
              }}
              className="text-left rounded-lg border border-border/50 bg-card p-5 transition-all hover:border-primary/40 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className={"p-2 rounded-md " + colorClass}>
                  <Icon className="h-4 w-4" />
                </div>
                {isApplied && (
                  <Badge variant="secondary" className="text-xs gap-1">
                    <Check className="h-3 w-3" />
                    Applied
                  </Badge>
                )}
              </div>
              <h3 className="text-sm font-semibold mb-1">{template.name}</h3>
              <p className="text-xs text-muted-foreground leading-relaxed mb-3">
                {template.description}
              </p>
              <div className="flex items-center justify-between">
                <Badge variant="outline" className="text-xs">
                  {template.industry}
                </Badge>
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <Users className="h-3 w-3" />
                  {template.nodes.length} roles
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {/* Preview Dialog */}
      <Dialog open={!!previewTemplate} onOpenChange={(open) => !open && setPreviewTemplate(null)}>
        <DialogContent className="max-w-lg">
          {previewTemplate && (
            <>
              <DialogHeader>
                <DialogTitle>{previewTemplate.name}</DialogTitle>
                <DialogDescription>{previewTemplate.description}</DialogDescription>
              </DialogHeader>

              <div className="space-y-4 py-2">
                {/* Roles list */}
                <div>
                  <h4 className="text-xs font-medium text-muted-foreground  mb-2">
                    Roles ({previewTemplate.nodes.length})
                  </h4>
                  <div className="space-y-2">
                    {previewTemplate.nodes.map((node) => (
                      <div
                        key={node.id}
                        className="flex items-start gap-3 rounded-md border border-border/50 p-3"
                      >
                        <div className="bg-muted p-1.5 rounded-md mt-0.5">
                          <Users className="h-3.5 w-3.5 text-muted-foreground" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium">{node.data.label}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {node.data.capabilities}
                          </p>
                        </div>
                        <Badge variant="outline" className="text-xs shrink-0">
                          {node.data.role}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Reporting structure */}
                <div>
                  <h4 className="text-xs font-medium text-muted-foreground  mb-2">
                    Reporting Structure
                  </h4>
                  <div className="space-y-1.5">
                    {previewTemplate.edges.map((edge) => {
                      const sourceNode = previewTemplate.nodes.find((n) => n.id === edge.source);
                      const targetNode = previewTemplate.nodes.find((n) => n.id === edge.target);
                      return (
                        <div
                          key={edge.id}
                          className="flex items-center gap-2 text-xs text-muted-foreground"
                        >
                          <span className="font-medium text-foreground">
                            {sourceNode?.data.label ?? edge.source}
                          </span>
                          <ArrowRight className="h-3 w-3 shrink-0" />
                          <span className="font-medium text-foreground">
                            {targetNode?.data.label ?? edge.target}
                          </span>
                          {edge.label && (
                            <span className="text-muted-foreground/70">({edge.label})</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Create agents toggle */}
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={createAgents}
                    onChange={(e) => setCreateAgents(e.target.checked)}
                    className="rounded border-border"
                  />
                  <span className="text-sm">Also create agents for each role</span>
                </label>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setPreviewTemplate(null)}>
                  Cancel
                </Button>
                <Button
                  disabled={!selectedCompanyId || applyMutation.isPending}
                  onClick={() => {
                    if (!selectedCompanyId) return;
                    applyMutation.mutate({
                      companyId: selectedCompanyId,
                      templateId: previewTemplate.id,
                      withAgents: createAgents,
                    });
                  }}
                >
                  {applyMutation.isPending ? "Applying..." : "Apply Template"}
                </Button>
              </DialogFooter>

              {applyMutation.isError && (
                <p className="text-xs text-destructive mt-2">
                  Failed to apply template. Please try again.
                </p>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
