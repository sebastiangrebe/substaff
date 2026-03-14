import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import { useNavigate } from "@/lib/router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { agentsApi, type OrgNode } from "../api/agents";
import { accessApi } from "../api/access";
import { useChat } from "../context/ChatContext";
import { useCompany } from "../context/CompanyContext";
import { useDialog } from "../context/DialogContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { queryKeys } from "../lib/queryKeys";
import { agentUrl, cn } from "../lib/utils";
import { EmptyState } from "../components/EmptyState";
import { PageSkeleton } from "../components/PageSkeleton";
import { RolesPanel } from "../components/RolesPanel";
import { AgentIcon } from "../components/AgentIconPicker";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Network, Plus, MessageSquareText, Shield, UserPlus, UserCheck, User, Link2, Copy, Check, Clock, Bot, UserX, Loader2 } from "lucide-react";
import { BUILTIN_ROLE_LABELS, type Agent, type JoinRequest } from "@substaff/shared";

// Layout constants
const CARD_W = 220;
const CARD_H = 84;
const GAP_X = 40;
const GAP_Y = 64;
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
  image?: string | null;
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
    image: node.image,
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
    <div className="flex flex-col h-[calc(100vh-4rem)]">
      <div className="flex items-end justify-between mb-1">
        <div>
          <h1 className="text-xl font-bold">Organization</h1>
          <p className="text-sm text-muted-foreground">
            Manage your team structure and roles.
          </p>
        </div>
      </div>

      <Tabs defaultValue="chart" className="flex flex-col flex-1 min-h-0">
        <TabsList variant="line">
          <TabsTrigger value="chart">
            <Network className="h-3.5 w-3.5" />
            Org Chart
          </TabsTrigger>
          <TabsTrigger value="roles">
            <Shield className="h-3.5 w-3.5" />
            Roles
          </TabsTrigger>
          <TabsTrigger value="invites">
            <UserPlus className="h-3.5 w-3.5" />
            Invites
          </TabsTrigger>
        </TabsList>

        <TabsContent value="chart" className="mt-0 flex-1 min-h-0">
          <OrgChartView
            companyId={selectedCompanyId}
            onAddAgent={openNewAgent}
          />
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
  const chatContext = useChat();

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
      {/* Chart canvas */}
      <div
        ref={containerRef}
        className="flex-1 overflow-hidden relative bg-background border border-border/60 rounded-xl"
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
            variant={chatContext.isOpen && chatContext.contextKey === "org:prompt-to-org" ? "secondary" : "outline"}
            onClick={() => {
              if (chatContext.isOpen && chatContext.contextKey === "org:prompt-to-org") {
                chatContext.close();
              } else {
                chatContext.open({ contextKey: "org:prompt-to-org", meta: { companyId } });
              }
            }}
          >
            <MessageSquareText className="h-4 w-4" />
            Prompt to Org
          </Button>
        </div>

        {/* Zoom controls */}
        <div className="absolute top-3 right-3 z-10 flex flex-col gap-px rounded-lg border border-border/60 bg-card shadow-sm overflow-hidden">
          <button
            className="w-8 h-8 flex items-center justify-center text-sm text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors"
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
          <div className="h-px bg-border/60" />
          <button
            className="w-8 h-8 flex items-center justify-center text-sm text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors"
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
          <div className="h-px bg-border/60" />
          <button
            className="w-8 h-8 flex items-center justify-center text-[10px] font-medium text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors"
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
          <div className="h-px bg-border/60" />
          <div className="w-8 h-6 flex items-center justify-center text-[9px] font-mono text-muted-foreground/60">
            {Math.round(zoom * 100)}%
          </div>
        </div>

        {/* SVG layer for dot grid + edges */}
        <svg
          className="absolute inset-0 pointer-events-none"
          style={{ width: "100%", height: "100%" }}
        >
          <defs>
            <pattern id="org-dot-grid" width="24" height="24" patternUnits="userSpaceOnUse">
              <circle cx="1" cy="1" r="0.8" fill="var(--border)" opacity="0.5" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#org-dot-grid)" />
          <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
            {edges.map(({ parent, child }) => {
              const x1 = parent.x + CARD_W / 2;
              const y1 = parent.y + CARD_H;
              const x2 = child.x + CARD_W / 2;
              const y2 = child.y;
              const midY = (y1 + y2) / 2;

              return (
                <g key={`${parent.id}-${child.id}`}>
                  {/* Soft glow behind the line */}
                  <path
                    d={`M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`}
                    fill="none"
                    stroke="var(--primary)"
                    strokeWidth={3}
                    opacity={0.06}
                  />
                  <path
                    d={`M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`}
                    fill="none"
                    stroke="var(--primary)"
                    strokeWidth={1.5}
                    opacity={0.25}
                  />
                  {/* Connection dot at child end */}
                  <circle cx={x2} cy={y2} r={3} fill="var(--primary)" opacity={0.2} />
                </g>
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
            const isRoot = !node.managerId;
            const statusLabel = isHuman ? "online" : node.status;

            return (
              <div
                key={node.id}
                data-org-card
                className={`absolute rounded-xl select-none transition-all duration-200 group ${
                  isHuman
                    ? "bg-card border border-primary/20 hover:border-primary/40 shadow-sm hover:shadow-md"
                    : `bg-card border border-border/80 hover:border-primary/30 shadow-sm hover:shadow-md cursor-pointer${isRoot ? " ring-1 ring-primary/8" : ""}`
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
                {/* Subtle top accent bar for root agent nodes */}
                {isRoot && !isHuman && (
                  <div className="absolute inset-x-0 top-0 h-[2px] rounded-t-xl bg-gradient-to-r from-primary/40 via-primary/60 to-primary/40" />
                )}

                <div className="flex items-center px-3.5 py-3 gap-3">
                  {/* Avatar with status ring */}
                  <div className="relative shrink-0">
                    <div
                      className="rounded-full p-[2px]"
                      style={{
                        background: `linear-gradient(135deg, ${dotColor}40, ${dotColor}15)`,
                      }}
                    >
                      <div className={`w-9 h-9 rounded-full flex items-center justify-center overflow-hidden ${
                        isHuman ? "bg-primary/8" : "bg-muted/80"
                      }`}>
                        {isHuman && node.image ? (
                          <img src={node.image} alt={node.name} className="w-full h-full object-cover" />
                        ) : isHuman ? (
                          <User className="h-4 w-4 text-primary" />
                        ) : (
                          <AgentIcon icon={agent?.icon} className="h-4 w-4 text-foreground/60" />
                        )}
                      </div>
                    </div>
                    {/* Status dot with glow */}
                    <span
                      className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-card"
                      style={{
                        backgroundColor: dotColor,
                        boxShadow: `0 0 6px ${dotColor}60`,
                      }}
                    />
                  </div>

                  {/* Text content */}
                  <div className="flex flex-col items-start min-w-0 flex-1">
                    <span className="text-[13px] font-semibold text-foreground leading-tight truncate w-full group-hover:text-primary transition-colors duration-150">
                      {node.name}
                    </span>
                    <span className="text-[11px] text-muted-foreground leading-tight mt-0.5 truncate w-full">
                      {isHuman ? "Manager" : (agent?.title ?? roleLabel(node.role))}
                    </span>
                    {!isHuman && agent && (
                      <div className="flex items-center gap-1.5 mt-1.5">
                        <span
                          className="inline-flex items-center gap-1 rounded-full px-1.5 py-px text-[9px] font-medium leading-tight"
                          style={{
                            backgroundColor: `${dotColor}18`,
                            color: dotColor,
                          }}
                        >
                          <span
                            className={`inline-block h-1.5 w-1.5 rounded-full ${node.status === "running" ? "animate-pulse" : ""}`}
                            style={{ backgroundColor: dotColor }}
                          />
                          {statusLabel}
                        </span>
                        <span className="text-[9px] text-muted-foreground/50 font-mono truncate">
                          {adapterLabels[agent.adapterType] ?? agent.adapterType}
                        </span>
                      </div>
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

function JoinRequestStatusBadge({ status }: { status: string }) {
  switch (status) {
    case "pending_approval":
      return (
        <Badge variant="outline" className="text-[10px] bg-yellow-500/10 text-yellow-600 border-yellow-500/20">
          <Clock className="h-2.5 w-2.5 mr-1" />
          Pending
        </Badge>
      );
    case "approved":
      return (
        <Badge variant="outline" className="text-[10px] bg-green-500/10 text-green-600 border-green-500/20">
          <UserCheck className="h-2.5 w-2.5 mr-1" />
          Approved
        </Badge>
      );
    case "rejected":
      return (
        <Badge variant="outline" className="text-[10px] bg-red-500/10 text-red-600 border-red-500/20">
          <UserX className="h-2.5 w-2.5 mr-1" />
          Rejected
        </Badge>
      );
    default:
      return <Badge variant="outline" className="text-[10px]">{status}</Badge>;
  }
}

function JoinRequestRow({
  request,
  onApprove,
  onReject,
  isApproving,
  isRejecting,
}: {
  request: JoinRequest;
  onApprove: () => void;
  onReject: () => void;
  isApproving: boolean;
  isRejecting: boolean;
}) {
  const isPending = request.status === "pending_approval";
  const isAgent = request.requestType === "agent";
  const name = isAgent
    ? request.agentName ?? "Unnamed agent"
    : request.requestNameSnapshot ?? request.requestEmailSnapshot ?? "Unknown user";

  return (
    <div className="group flex items-center gap-3 px-4 py-3 hover:bg-accent/50 transition-colors">
      <div className={cn(
        "h-8 w-8 rounded-lg flex items-center justify-center shrink-0",
        isAgent ? "bg-blue-500/10" : "bg-primary/10",
      )}>
        {isAgent ? (
          <Bot className="h-3.5 w-3.5 text-blue-500" />
        ) : (
          <User className="h-3.5 w-3.5 text-primary" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{name}</span>
          <span className="text-[10px] font-mono text-muted-foreground/50">{isAgent ? "agent" : "human"}</span>
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">
          {isAgent && request.adapterType
            ? `Adapter: ${request.adapterType}`
            : request.requestEmailSnapshot ?? "No email provided"}
          {" \u00b7 "}
          {new Date(request.createdAt).toLocaleDateString()}
        </p>
      </div>
      <JoinRequestStatusBadge status={request.status} />
      {isPending && (
        <div className="flex items-center gap-1 shrink-0">
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs"
            onClick={onApprove}
            disabled={isApproving || isRejecting}
          >
            {isApproving ? <Loader2 className="h-3 w-3 animate-spin" /> : <UserCheck className="h-3 w-3 mr-1" />}
            Approve
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-xs text-muted-foreground hover:text-destructive"
            onClick={onReject}
            disabled={isApproving || isRejecting}
          >
            Reject
          </Button>
        </div>
      )}
    </div>
  );
}

function InvitesPanel({ companyId }: { companyId: string }) {
  const queryClient = useQueryClient();
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [joinType, setJoinType] = useState<"both" | "human" | "agent">("both");

  const { data: pendingRequests, isLoading: requestsLoading } = useQuery({
    queryKey: [...queryKeys.sidebarBadges(companyId), "join-requests", "pending"],
    queryFn: () => accessApi.listJoinRequests(companyId, "pending_approval"),
    enabled: !!companyId,
  });

  const inviteMutation = useMutation({
    mutationFn: () =>
      accessApi.createCompanyInvite(companyId, {
        allowedJoinTypes: joinType,
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

  const approveMutation = useMutation({
    mutationFn: (requestId: string) => accessApi.approveJoinRequest(companyId, requestId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [...queryKeys.sidebarBadges(companyId), "join-requests"] });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: (requestId: string) => accessApi.rejectJoinRequest(companyId, requestId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [...queryKeys.sidebarBadges(companyId), "join-requests"] });
    },
  });

  async function handleCopy() {
    if (!inviteLink) return;
    await navigator.clipboard.writeText(inviteLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="space-y-6 pt-4">
      {/* Create Invite Section */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold">Create Invite</h3>
        </div>
        <div className="rounded-lg border border-border/50 bg-card overflow-hidden">
          <div className="px-4 py-4 space-y-4">
            <p className="text-sm text-muted-foreground">
              Generate a shareable link to invite humans or agents to this company. Links expire after 72 hours.
            </p>

            {/* Join type selector */}
            <div>
              <label className="text-xs text-muted-foreground mb-1.5 block">Who can join</label>
              <div className="flex gap-2">
                {(["both", "human", "agent"] as const).map((type) => (
                  <button
                    key={type}
                    type="button"
                    className={cn(
                      "flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs transition-colors",
                      joinType === type
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border text-muted-foreground hover:bg-accent/50",
                    )}
                    onClick={() => setJoinType(type)}
                  >
                    {type === "human" && <User className="h-3 w-3" />}
                    {type === "agent" && <Bot className="h-3 w-3" />}
                    {type === "both" && <UserPlus className="h-3 w-3" />}
                    {type === "both" ? "Anyone" : type === "human" ? "Humans only" : "Agents only"}
                  </button>
                ))}
              </div>
            </div>

            <Button size="sm" onClick={() => inviteMutation.mutate()} disabled={inviteMutation.isPending}>
              {inviteMutation.isPending ? (
                <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Creating...</>
              ) : (
                <><Link2 className="h-3.5 w-3.5 mr-1.5" /> Generate Invite Link</>
              )}
            </Button>

            {inviteError && <p className="text-sm text-destructive">{inviteError}</p>}
          </div>

          {/* Generated link display */}
          {inviteLink && (
            <div className="border-t border-border/50 bg-muted/30 px-4 py-3">
              <div className="flex items-center gap-2 mb-1.5">
                <Link2 className="h-3 w-3 text-green-500" />
                <span className="text-xs font-medium text-green-600">Invite link created</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex-1 rounded-md border border-border bg-card px-3 py-2 overflow-hidden">
                  <p className="text-xs font-mono text-muted-foreground truncate">{inviteLink}</p>
                </div>
                <Button size="sm" variant="outline" className="shrink-0" onClick={handleCopy}>
                  {copied ? (
                    <><Check className="h-3.5 w-3.5 mr-1.5 text-green-500" /> Copied</>
                  ) : (
                    <><Copy className="h-3.5 w-3.5 mr-1.5" /> Copy</>
                  )}
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Pending Join Requests */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold">Join Requests</h3>
            {(pendingRequests?.length ?? 0) > 0 && (
              <span className="inline-flex items-center justify-center h-5 min-w-5 rounded-full bg-yellow-500/15 text-yellow-600 text-[10px] font-medium px-1.5">
                {pendingRequests!.length}
              </span>
            )}
          </div>
        </div>

        {requestsLoading ? (
          <div className="rounded-lg border border-border/50 bg-card p-6 flex items-center justify-center">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : (pendingRequests?.length ?? 0) === 0 ? (
          <div className="rounded-lg border border-dashed border-border/60 bg-card">
            <div className="flex flex-col items-center justify-center py-8 px-4 text-center">
              <div className="rounded-xl bg-muted/50 h-10 w-10 flex items-center justify-center mb-3">
                <UserCheck className="h-5 w-5 text-muted-foreground/40" />
              </div>
              <p className="text-xs text-muted-foreground max-w-[240px] leading-relaxed">
                No pending join requests. Share an invite link to get started.
              </p>
            </div>
          </div>
        ) : (
          <div className="border border-border/50 rounded-lg divide-y divide-border/30 bg-card">
            {pendingRequests!.map((request) => (
              <JoinRequestRow
                key={request.id}
                request={request}
                onApprove={() => approveMutation.mutate(request.id)}
                onReject={() => rejectMutation.mutate(request.id)}
                isApproving={approveMutation.isPending && approveMutation.variables === request.id}
                isRejecting={rejectMutation.isPending && rejectMutation.variables === request.id}
              />
            ))}
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
