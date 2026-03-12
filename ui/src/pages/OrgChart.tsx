import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import { useNavigate } from "@/lib/router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { agentsApi, type OrgNode } from "../api/agents";
import { orgChartApi } from "../api/orgChart";
import { accessApi } from "../api/access";
import { useCompany } from "../context/CompanyContext";
import { useDialog } from "../context/DialogContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { queryKeys } from "../lib/queryKeys";
import { agentUrl } from "../lib/utils";
import { EmptyState } from "../components/EmptyState";
import { PageSkeleton } from "../components/PageSkeleton";
import { RolesPanel } from "../components/RolesPanel";
import { AgentIcon } from "../components/AgentIconPicker";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Network, Plus, MessageSquareText, Shield, UserPlus, X, UserCheck, User } from "lucide-react";
import { BUILTIN_ROLE_LABELS, type Agent } from "@substaff/shared";

// Layout constants
const CARD_W = 200;
const CARD_H = 100;
const GAP_X = 32;
const GAP_Y = 80;
const PADDING = 60;

// ── Tree layout types ───────────────────────────────────────────────────

interface LayoutNode {
  id: string;
  name: string;
  role: string;
  status: string;
  managerId: string | null;
  managerName: string | null;
  nodeType?: "human";
  x: number;
  y: number;
  children: LayoutNode[];
}

// ── Layout algorithm ────────────────────────────────────────────────────

function subtreeWidth(node: OrgNode): number {
  if (node.reports.length === 0) return CARD_W;
  const childrenW = node.reports.reduce((sum, c) => sum + subtreeWidth(c), 0);
  const gaps = (node.reports.length - 1) * GAP_X;
  return Math.max(CARD_W, childrenW + gaps);
}

function layoutTree(node: OrgNode, x: number, y: number): LayoutNode {
  const totalW = subtreeWidth(node);
  const layoutChildren: LayoutNode[] = [];

  if (node.reports.length > 0) {
    const childrenW = node.reports.reduce((sum, c) => sum + subtreeWidth(c), 0);
    const gaps = (node.reports.length - 1) * GAP_X;
    let cx = x + (totalW - childrenW - gaps) / 2;

    for (const child of node.reports) {
      const cw = subtreeWidth(child);
      layoutChildren.push(layoutTree(child, cx, y + CARD_H + GAP_Y));
      cx += cw + GAP_X;
    }
  }

  return {
    id: node.id,
    name: node.name,
    role: node.role,
    status: node.status,
    managerId: node.managerId,
    managerName: node.managerName,
    nodeType: node.nodeType,
    x: x + (totalW - CARD_W) / 2,
    y,
    children: layoutChildren,
  };
}

function layoutForest(roots: OrgNode[]): LayoutNode[] {
  if (roots.length === 0) return [];

  let x = PADDING;
  const y = PADDING;

  const result: LayoutNode[] = [];
  for (const root of roots) {
    const w = subtreeWidth(root);
    result.push(layoutTree(root, x, y));
    x += w + GAP_X;
  }

  return result;
}

function flattenLayout(nodes: LayoutNode[]): LayoutNode[] {
  const result: LayoutNode[] = [];
  function walk(n: LayoutNode) {
    result.push(n);
    n.children.forEach(walk);
  }
  nodes.forEach(walk);
  return result;
}

function collectEdges(nodes: LayoutNode[]): Array<{ parent: LayoutNode; child: LayoutNode }> {
  const edges: Array<{ parent: LayoutNode; child: LayoutNode }> = [];
  function walk(n: LayoutNode) {
    for (const c of n.children) {
      edges.push({ parent: n, child: c });
      walk(c);
    }
  }
  nodes.forEach(walk);
  return edges;
}

// ── Status dot colors (raw hex for SVG) ─────────────────────────────────

const adapterLabels: Record<string, string> = {
  blaxel_sandbox: "Blaxel Sandbox",
  e2b_sandbox: "E2B Sandbox",
  process: "Process",
  http: "HTTP",
};

const statusDotColor: Record<string, string> = {
  running: "#22d3ee",
  active: "#4ade80",
  paused: "#facc15",
  idle: "#facc15",
  error: "#f87171",
  terminated: "#a3a3a3",
};
const defaultDotColor = "#a3a3a3";

// ── Main component ──────────────────────────────────────────────────────

export function OrgChart() {
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const { openNewAgent } = useDialog();

  useEffect(() => {
    setBreadcrumbs([{ label: "Organization" }]);
  }, [setBreadcrumbs]);

  if (!selectedCompanyId) {
    return <EmptyState icon={Network} message="Select a company to view the org chart." />;
  }

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-xl font-bold">Organization</h1>
        <p className="text-sm text-muted-foreground">
          Manage your team structure and roles.
        </p>
      </div>

      <Tabs defaultValue="chart">
        <TabsList className="mb-3">
          <TabsTrigger value="chart">
            <Network className="h-3.5 w-3.5 mr-1.5" />
            Org Chart
          </TabsTrigger>
          <TabsTrigger value="roles">
            <Shield className="h-3.5 w-3.5 mr-1.5" />
            Roles
          </TabsTrigger>
          <TabsTrigger value="invites">
            <UserPlus className="h-3.5 w-3.5 mr-1.5" />
            Invites
          </TabsTrigger>
        </TabsList>

        <TabsContent value="chart" className="mt-0">
          <div className="h-[calc(100vh-14rem)]">
            <OrgChartView
              companyId={selectedCompanyId}
              onAddAgent={openNewAgent}
            />
          </div>
        </TabsContent>

        <TabsContent value="roles" className="mt-0">
          <RolesPanel />
        </TabsContent>

        <TabsContent value="invites" className="mt-0">
          <InvitesPanel companyId={selectedCompanyId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function OrgChartView({ companyId, onAddAgent }: { companyId: string; onAddAgent: () => void }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [showPrompt, setShowPrompt] = useState(false);
  const [promptText, setPromptText] = useState("");

  const { data: orgTree, isLoading } = useQuery({
    queryKey: queryKeys.org(companyId),
    queryFn: () => agentsApi.org(companyId),
    enabled: !!companyId,
  });

  const { data: agents } = useQuery({
    queryKey: queryKeys.agents.list(companyId),
    queryFn: () => agentsApi.list(companyId),
    enabled: !!companyId,
  });


  // Load saved prompt-to-org text
  const { data: savedChart } = useQuery({
    queryKey: queryKeys.orgChart(companyId),
    queryFn: () => orgChartApi.get(companyId),
    enabled: !!companyId,
  });

  useEffect(() => {
    if (savedChart?.promptToOrg) {
      setPromptText(savedChart.promptToOrg);
    }
  }, [savedChart?.promptToOrg]);

  const savePromptMutation = useMutation({
    mutationFn: (prompt: string) =>
      orgChartApi.save(companyId, {
        nodes: savedChart?.nodes ?? [],
        edges: savedChart?.edges ?? [],
        promptToOrg: prompt || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.orgChart(companyId) });
    },
  });

  const agentMap = useMemo(() => {
    const m = new Map<string, Agent>();
    for (const a of agents ?? []) m.set(a.id, a);
    return m;
  }, [agents]);

  // Layout computation
  const layout = useMemo(() => layoutForest(orgTree ?? []), [orgTree]);
  const allNodes = useMemo(() => flattenLayout(layout), [layout]);
  const edges = useMemo(() => collectEdges(layout), [layout]);

  // Compute SVG bounds
  const bounds = useMemo(() => {
    if (allNodes.length === 0) return { width: 800, height: 600 };
    let maxX = 0, maxY = 0;
    for (const n of allNodes) {
      maxX = Math.max(maxX, n.x + CARD_W);
      maxY = Math.max(maxY, n.y + CARD_H);
    }
    return { width: maxX + PADDING, height: maxY + PADDING };
  }, [allNodes]);

  // Pan & zoom state
  const containerRef = useRef<HTMLDivElement>(null);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0, panX: 0, panY: 0 });

  // Center the chart on first load
  const hasInitialized = useRef(false);
  useEffect(() => {
    if (hasInitialized.current || allNodes.length === 0 || !containerRef.current) return;
    hasInitialized.current = true;

    const container = containerRef.current;
    const containerW = container.clientWidth;
    const containerH = container.clientHeight;

    const scaleX = (containerW - 40) / bounds.width;
    const scaleY = (containerH - 40) / bounds.height;
    const fitZoom = Math.min(scaleX, scaleY, 1);

    const chartW = bounds.width * fitZoom;
    const chartH = bounds.height * fitZoom;

    setZoom(fitZoom);
    setPan({
      x: (containerW - chartW) / 2,
      y: (containerH - chartH) / 2,
    });
  }, [allNodes, bounds]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest("[data-org-card]")) return;
    setDragging(true);
    dragStart.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
  }, [pan]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragging) return;
    const dx = e.clientX - dragStart.current.x;
    const dy = e.clientY - dragStart.current.y;
    setPan({ x: dragStart.current.panX + dx, y: dragStart.current.panY + dy });
  }, [dragging]);

  const handleMouseUp = useCallback(() => {
    setDragging(false);
  }, []);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const container = containerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const factor = e.deltaY < 0 ? 1.1 : 0.9;
    const newZoom = Math.min(Math.max(zoom * factor, 0.2), 2);

    const scale = newZoom / zoom;
    setPan({
      x: mouseX - scale * (mouseX - pan.x),
      y: mouseY - scale * (mouseY - pan.y),
    });
    setZoom(newZoom);
  }, [zoom, pan]);

  if (isLoading) {
    return <PageSkeleton variant="org-chart" />;
  }

  if (orgTree && orgTree.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-8rem)] gap-4">
        <EmptyState icon={Network} message="No organizational hierarchy defined." />
        <Button size="sm" onClick={onAddAgent}>
          <Plus className="h-4 w-4" />
          Add Agent
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Prompt-to-Org panel */}
      {showPrompt && (
        <div className="border-b border-border bg-card px-4 py-3 space-y-2 shrink-0">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Prompt-to-Org
            </span>
            <Button size="icon-xs" variant="ghost" onClick={() => setShowPrompt(false)}>
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
          <textarea
            className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm outline-none resize-y min-h-[60px] focus:border-primary"
            placeholder="Describe your org structure in natural language... (e.g. 'A CEO managing a CTO and CMO. The CTO has 3 engineers and 1 QA.')"
            value={promptText}
            onChange={(e) => setPromptText(e.target.value)}
          />
          <div className="flex items-center justify-between">
            <p className="text-[11px] text-muted-foreground">
              Automatic generation from natural language is coming soon.
            </p>
            <Button
              size="xs"
              onClick={() => savePromptMutation.mutate(promptText)}
              disabled={savePromptMutation.isPending}
            >
              {savePromptMutation.isPending ? "Saving..." : "Save"}
            </Button>
          </div>
        </div>
      )}

      {/* Chart canvas */}
      <div
        ref={containerRef}
        className="flex-1 overflow-hidden relative bg-muted/20 border border-border rounded-lg"
        style={{ cursor: dragging ? "grabbing" : "grab" }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
      >
        {/* Top-left actions */}
        <div className="absolute top-3 left-3 z-10 flex items-center gap-1.5">
          <Button size="sm" onClick={onAddAgent}>
            <Plus className="h-4 w-4" />
            Add Agent
          </Button>
          <Button
            size="sm"
            variant={showPrompt ? "secondary" : "outline"}
            onClick={() => setShowPrompt(!showPrompt)}
          >
            <MessageSquareText className="h-4 w-4" />
            Prompt to Org
          </Button>
        </div>

        {/* Zoom controls */}
        <div className="absolute top-3 right-3 z-10 flex flex-col gap-1">
          <button
            className="w-7 h-7 flex items-center justify-center bg-background border border-border rounded text-sm hover:bg-accent transition-colors"
            onClick={() => {
              const newZoom = Math.min(zoom * 1.2, 2);
              const container = containerRef.current;
              if (container) {
                const cx = container.clientWidth / 2;
                const cy = container.clientHeight / 2;
                const scale = newZoom / zoom;
                setPan({ x: cx - scale * (cx - pan.x), y: cy - scale * (cy - pan.y) });
              }
              setZoom(newZoom);
            }}
            aria-label="Zoom in"
          >
            +
          </button>
          <button
            className="w-7 h-7 flex items-center justify-center bg-background border border-border rounded text-sm hover:bg-accent transition-colors"
            onClick={() => {
              const newZoom = Math.max(zoom * 0.8, 0.2);
              const container = containerRef.current;
              if (container) {
                const cx = container.clientWidth / 2;
                const cy = container.clientHeight / 2;
                const scale = newZoom / zoom;
                setPan({ x: cx - scale * (cx - pan.x), y: cy - scale * (cy - pan.y) });
              }
              setZoom(newZoom);
            }}
            aria-label="Zoom out"
          >
            &minus;
          </button>
          <button
            className="w-7 h-7 flex items-center justify-center bg-background border border-border rounded text-[10px] hover:bg-accent transition-colors"
            onClick={() => {
              if (!containerRef.current) return;
              const cW = containerRef.current.clientWidth;
              const cH = containerRef.current.clientHeight;
              const scaleX = (cW - 40) / bounds.width;
              const scaleY = (cH - 40) / bounds.height;
              const fitZoom = Math.min(scaleX, scaleY, 1);
              const chartW = bounds.width * fitZoom;
              const chartH = bounds.height * fitZoom;
              setZoom(fitZoom);
              setPan({ x: (cW - chartW) / 2, y: (cH - chartH) / 2 });
            }}
            title="Fit to screen"
            aria-label="Fit chart to screen"
          >
            Fit
          </button>
        </div>

        {/* SVG layer for edges */}
        <svg
          className="absolute inset-0 pointer-events-none"
          style={{ width: "100%", height: "100%" }}
        >
          <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
            {edges.map(({ parent, child }) => {
              const x1 = parent.x + CARD_W / 2;
              const y1 = parent.y + CARD_H;
              const x2 = child.x + CARD_W / 2;
              const y2 = child.y;
              const midY = (y1 + y2) / 2;

              return (
                <path
                  key={`${parent.id}-${child.id}`}
                  d={`M ${x1} ${y1} L ${x1} ${midY} L ${x2} ${midY} L ${x2} ${y2}`}
                  fill="none"
                  stroke="var(--border)"
                  strokeWidth={1.5}
                />
              );
            })}
          </g>
        </svg>

        {/* Card layer */}
        <div
          className="absolute inset-0"
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: "0 0",
          }}
        >
          {allNodes.map((node) => {
            const isHuman = node.nodeType === "human";
            const agent = isHuman ? undefined : agentMap.get(node.id);
            const dotColor = isHuman ? "#4ade80" : (statusDotColor[node.status] ?? defaultDotColor);

            return (
              <div
                key={node.id}
                data-org-card
                className={`absolute rounded-lg shadow-sm hover:shadow-md transition-[box-shadow,border-color] duration-150 select-none ${
                  isHuman
                    ? "bg-primary/5 border-2 border-primary/30 hover:border-primary/50"
                    : "bg-card border border-border hover:border-foreground/20 cursor-pointer"
                }`}
                style={{
                  left: node.x,
                  top: node.y,
                  width: CARD_W,
                  minHeight: CARD_H,
                }}
                onClick={() => {
                  if (!isHuman) navigate(agent ? agentUrl(agent) : `/agents/${node.id}`);
                }}
              >
                <div className="flex items-center px-4 py-3 gap-3">
                  <div className="relative shrink-0">
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center ${
                      isHuman ? "bg-primary/10" : "bg-muted"
                    }`}>
                      {isHuman ? (
                        <User className="h-4.5 w-4.5 text-primary" />
                      ) : (
                        <AgentIcon icon={agent?.icon} className="h-4.5 w-4.5 text-foreground/70" />
                      )}
                    </div>
                    <span
                      className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-card"
                      style={{ backgroundColor: dotColor }}
                    />
                  </div>
                  <div className="flex flex-col items-start min-w-0 flex-1">
                    <span className="text-sm font-semibold text-foreground leading-tight">
                      {node.name}
                    </span>
                    <span className="text-[11px] text-muted-foreground leading-tight mt-0.5">
                      {isHuman ? "Manager" : (agent?.title ?? roleLabel(node.role))}
                    </span>
                    {!isHuman && agent && (
                      <span className="text-[10px] text-muted-foreground/60 font-mono leading-tight mt-1">
                        {adapterLabels[agent.adapterType] ?? agent.adapterType}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function InvitesPanel({ companyId }: { companyId: string }) {
  const queryClient = useQueryClient();
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);

  const inviteMutation = useMutation({
    mutationFn: () =>
      accessApi.createCompanyInvite(companyId, {
        allowedJoinTypes: "both",
        expiresInHours: 72,
      }),
    onSuccess: (invite) => {
      setInviteError(null);
      const base = window.location.origin.replace(/\/+$/, "");
      const absoluteUrl = invite.inviteUrl.startsWith("http")
        ? invite.inviteUrl
        : `${base}${invite.inviteUrl}`;
      setInviteLink(absoluteUrl);
      queryClient.invalidateQueries({ queryKey: queryKeys.sidebarBadges(companyId) });
    },
    onError: (err) => {
      setInviteError(err instanceof Error ? err.message : "Failed to create invite");
    },
  });

  return (
    <div className="space-y-3">
      <div className="space-y-3 rounded-xl border border-border/50 px-4 py-4">
        <p className="text-sm text-muted-foreground">
          Generate a link to invite humans or agents to this company. Links expire after 72 hours.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={() => inviteMutation.mutate()} disabled={inviteMutation.isPending}>
            {inviteMutation.isPending ? "Creating..." : "Create invite link"}
          </Button>
          {inviteLink && (
            <Button
              size="sm"
              variant="outline"
              onClick={async () => {
                await navigator.clipboard.writeText(inviteLink);
              }}
            >
              Copy link
            </Button>
          )}
        </div>
        {inviteError && <p className="text-sm text-destructive">{inviteError}</p>}
        {inviteLink && (
          <div className="rounded-md border border-border bg-muted/30 p-3">
            <span className="text-sm text-muted-foreground">Share link</span>
            <p className="mt-1 break-all font-mono text-sm">{inviteLink}</p>
          </div>
        )}
      </div>
    </div>
  );
}

const roleLabels: Record<string, string> = BUILTIN_ROLE_LABELS;

function roleLabel(role: string): string {
  return roleLabels[role] ?? role;
}
