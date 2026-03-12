import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Panel,
  addEdge,
  useNodesState,
  useEdgesState,
  type Connection,
  type NodeTypes,
  type Node,
  type Edge,
  type NodeProps,
  Handle,
  Position,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { orgChartApi, type OrgChartData } from "../api/orgChart";
import { agentsApi, type OrgNode } from "../api/agents";
import { queryKeys } from "../lib/queryKeys";
import { Button } from "@/components/ui/button";
import { Plus, Save, Trash2, MessageSquareText } from "lucide-react";

// ── Role options ──────────────────────────────────────────────────────

const ROLE_OPTIONS = [
  "ceo", "cto", "cmo", "cfo", "vp_engineering", "vp_product",
  "engineer", "designer", "pm", "qa", "devops", "researcher", "general",
] as const;

const ADAPTER_OPTIONS = [
  "blaxel_sandbox",
  "e2b_sandbox",
] as const;

const roleLabels: Record<string, string> = {
  ceo: "CEO", cto: "CTO", cmo: "CMO", cfo: "CFO",
  vp_engineering: "VP Engineering", vp_product: "VP Product",
  engineer: "Engineer", designer: "Designer", pm: "PM",
  qa: "QA", devops: "DevOps", researcher: "Researcher", general: "General",
};

// ── Custom node component ─────────────────────────────────────────────

interface AgentNodeData {
  name: string;
  role: string;
  adapterType: string;
  onUpdate: (id: string, data: { name: string; role: string; adapterType: string }) => void;
  onDelete: (id: string) => void;
  [key: string]: unknown;
}

function AgentRoleNode({ id, data, selected }: NodeProps<Node<AgentNodeData>>) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(data.name);
  const [role, setRole] = useState(data.role);
  const [adapterType, setAdapterType] = useState(data.adapterType);

  useEffect(() => {
    setName(data.name);
    setRole(data.role);
    setAdapterType(data.adapterType);
  }, [data.name, data.role, data.adapterType]);

  const handleSave = useCallback(() => {
    data.onUpdate(id, { name, role, adapterType });
    setEditing(false);
  }, [id, name, role, adapterType, data]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") handleSave();
      if (e.key === "Escape") setEditing(false);
    },
    [handleSave],
  );

  return (
    <div
      className={`bg-card border rounded-lg shadow-sm min-w-[200px] transition-colors ${
        selected ? "border-primary ring-2 ring-primary/20" : "border-border"
      }`}
    >
      <Handle type="target" position={Position.Top} className="!w-3 !h-3 !bg-muted-foreground !border-2 !border-card" />

      {editing ? (
        <div className="p-3 space-y-2" onKeyDown={handleKeyDown}>
          <input
            className="w-full rounded-md border border-border bg-transparent px-2 py-1 text-sm outline-none focus:border-primary"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Agent name"
            autoFocus
          />
          <select
            className="w-full rounded-md border border-border bg-transparent px-2 py-1 text-sm outline-none focus:border-primary"
            value={role}
            onChange={(e) => setRole(e.target.value)}
          >
            {ROLE_OPTIONS.map((r) => (
              <option key={r} value={r}>
                {roleLabels[r] ?? r}
              </option>
            ))}
          </select>
          <select
            className="w-full rounded-md border border-border bg-transparent px-2 py-1 text-sm outline-none focus:border-primary"
            value={adapterType}
            onChange={(e) => setAdapterType(e.target.value)}
          >
            {ADAPTER_OPTIONS.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
          <div className="flex items-center gap-1.5">
            <Button size="xs" onClick={handleSave}>
              Done
            </Button>
            <Button size="xs" variant="ghost" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="px-4 py-3">
          <div className="flex items-center justify-between gap-2">
            <span
              className="text-sm font-semibold text-foreground cursor-pointer hover:underline"
              onDoubleClick={() => setEditing(true)}
            >
              {data.name || "Unnamed"}
            </span>
            <div className="flex items-center gap-0.5">
              <button
                className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
                onClick={() => setEditing(true)}
                title="Edit node"
              >
                <MessageSquareText className="h-3 w-3" />
              </button>
              <button
                className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                onClick={() => data.onDelete(id)}
                title="Remove node"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          </div>
          <div className="text-[11px] text-muted-foreground mt-0.5">
            {roleLabels[data.role] ?? data.role}
          </div>
          <div className="text-[10px] text-muted-foreground/60 font-mono mt-1">
            {data.adapterType}
          </div>
        </div>
      )}

      <Handle type="source" position={Position.Bottom} className="!w-3 !h-3 !bg-muted-foreground !border-2 !border-card" />
    </div>
  );
}

// ── Convert OrgNode tree to flat nodes/edges for ReactFlow ────────────

function flattenOrgTree(
  roots: OrgNode[],
  agentLookup?: Map<string, { adapterType: string }>,
): { nodes: Array<{ id: string; position: { x: number; y: number }; data: { name: string; role: string; adapterType: string } }>; edges: Array<{ id: string; source: string; target: string; type: string }> } {
  const nodes: Array<{ id: string; position: { x: number; y: number }; data: { name: string; role: string; adapterType: string } }> = [];
  const edges: Array<{ id: string; source: string; target: string; type: string }> = [];

  const CARD_W = 220;
  const GAP_X = 40;
  const GAP_Y = 120;

  function subtreeWidth(node: OrgNode): number {
    if (node.reports.length === 0) return CARD_W;
    const childrenW = node.reports.reduce((sum, c) => sum + subtreeWidth(c), 0);
    const gaps = (node.reports.length - 1) * GAP_X;
    return Math.max(CARD_W, childrenW + gaps);
  }

  function walk(node: OrgNode, x: number, y: number, parentId?: string) {
    const totalW = subtreeWidth(node);
    const nodeX = x + (totalW - CARD_W) / 2;
    const adapter = agentLookup?.get(node.id)?.adapterType ?? "blaxel_sandbox";
    nodes.push({
      id: node.id,
      position: { x: nodeX, y },
      data: { name: node.name, role: node.role, adapterType: adapter },
    });
    if (parentId) {
      edges.push({
        id: `${parentId}-${node.id}`,
        source: parentId,
        target: node.id,
        type: "smoothstep",
      });
    }
    if (node.reports.length > 0) {
      const childrenW = node.reports.reduce((sum, c) => sum + subtreeWidth(c), 0);
      const gaps = (node.reports.length - 1) * GAP_X;
      let cx = x + (totalW - childrenW - gaps) / 2;
      for (const child of node.reports) {
        const cw = subtreeWidth(child);
        walk(child, cx, y + GAP_Y, node.id);
        cx += cw + GAP_X;
      }
    }
  }

  let x = 0;
  for (const root of roots) {
    const w = subtreeWidth(root);
    walk(root, x, 0);
    x += w + GAP_X;
  }

  return { nodes, edges };
}

// ── Main editor ───────────────────────────────────────────────────────

interface OrgChartEditorProps {
  companyId: string;
}

export function OrgChartEditor({ companyId }: OrgChartEditorProps) {
  const queryClient = useQueryClient();

  const { data: savedData, isLoading } = useQuery({
    queryKey: queryKeys.orgChart(companyId),
    queryFn: () => orgChartApi.get(companyId),
    enabled: !!companyId,
  });

  // Fetch existing agents/org tree to seed the editor when no saved data exists
  const hasSavedNodes = !isLoading && savedData?.nodes && savedData.nodes.length > 0;
  const { data: orgTree, isLoading: isOrgLoading } = useQuery({
    queryKey: queryKeys.org(companyId),
    queryFn: () => agentsApi.org(companyId),
    enabled: !!companyId && !isLoading && !hasSavedNodes,
  });

  const { data: agentsList } = useQuery({
    queryKey: queryKeys.agents.list(companyId),
    queryFn: () => agentsApi.list(companyId),
    enabled: !!companyId && !isLoading && !hasSavedNodes,
  });

  const agentMap = useMemo(() => {
    const m = new Map<string, { adapterType: string }>();
    for (const a of agentsList ?? []) m.set(a.id, { adapterType: a.adapterType });
    return m;
  }, [agentsList]);

  const [nodes, setNodes, onNodesChange] = useNodesState<Node<AgentNodeData>>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [promptToOrg, setPromptToOrg] = useState("");
  const [showPrompt, setShowPrompt] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const [dirty, setDirty] = useState(false);

  // Build node callbacks that remain stable across re-renders
  const handleNodeUpdate = useCallback(
    (nodeId: string, data: { name: string; role: string; adapterType: string }) => {
      setNodes((nds) =>
        nds.map((n) =>
          n.id === nodeId ? { ...n, data: { ...n.data, ...data } } : n,
        ),
      );
      setDirty(true);
    },
    [setNodes],
  );

  const handleNodeDelete = useCallback(
    (nodeId: string) => {
      setNodes((nds) => nds.filter((n) => n.id !== nodeId));
      setEdges((eds) => eds.filter((e) => e.source !== nodeId && e.target !== nodeId));
      setDirty(true);
    },
    [setNodes, setEdges],
  );

  // Inject callbacks into node data
  const nodesWithCallbacks = useMemo(
    () =>
      nodes.map((n) => ({
        ...n,
        data: { ...n.data, onUpdate: handleNodeUpdate, onDelete: handleNodeDelete },
      })),
    [nodes, handleNodeUpdate, handleNodeDelete],
  );

  // Load saved data on first fetch, or seed from existing agents if no saved data
  useEffect(() => {
    if (initialized || isLoading || isOrgLoading) return;

    if (savedData && savedData.nodes && savedData.nodes.length > 0) {
      // Load from saved org chart data
      const loadedNodes: Node<AgentNodeData>[] = savedData.nodes.map((n) => ({
        id: n.id,
        type: "agentRole",
        position: n.position,
        data: {
          name: n.data.name ?? "",
          role: n.data.role ?? "general",
          adapterType: n.data.adapterType ?? "blaxel_sandbox",
          onUpdate: handleNodeUpdate,
          onDelete: handleNodeDelete,
        },
      }));
      setNodes(loadedNodes);
      setEdges(
        savedData.edges.map((e) => ({
          id: e.id,
          source: e.source,
          target: e.target,
          type: e.type ?? "smoothstep",
        })),
      );
      setPromptToOrg((savedData as OrgChartData).promptToOrg ?? "");
    } else if (orgTree && orgTree.length > 0) {
      // Seed editor from existing agents' org hierarchy
      const { nodes: flatNodes, edges: flatEdges } = flattenOrgTree(orgTree, agentMap);
      const seededNodes: Node<AgentNodeData>[] = flatNodes.map((n) => ({
        id: n.id,
        type: "agentRole",
        position: n.position,
        data: {
          name: n.data.name,
          role: n.data.role,
          adapterType: n.data.adapterType,
          onUpdate: handleNodeUpdate,
          onDelete: handleNodeDelete,
        },
      }));
      setNodes(seededNodes);
      setEdges(flatEdges);
      setDirty(true); // Mark as dirty so user knows to save
    }

    setInitialized(true);
  }, [savedData, orgTree, agentMap, isLoading, isOrgLoading, initialized, handleNodeUpdate, handleNodeDelete, setNodes, setEdges]);

  const onConnect = useCallback(
    (params: Connection) => {
      setEdges((eds) => addEdge({ ...params, type: "smoothstep" }, eds));
      setDirty(true);
    },
    [setEdges],
  );

  // Track manual node/edge changes as dirty
  const handleNodesChange: typeof onNodesChange = useCallback(
    (changes) => {
      onNodesChange(changes);
      // Position changes (dragging) mark dirty
      if (changes.some((c) => c.type === "position" && "dragging" in c && c.dragging === false)) {
        setDirty(true);
      }
    },
    [onNodesChange],
  );

  const handleEdgesChange: typeof onEdgesChange = useCallback(
    (changes) => {
      onEdgesChange(changes);
      if (changes.some((c) => c.type === "remove")) {
        setDirty(true);
      }
    },
    [onEdgesChange],
  );

  const addNode = useCallback(() => {
    const id = `node-${Date.now()}`;
    const newNode: Node<AgentNodeData> = {
      id,
      type: "agentRole",
      position: { x: 250 + Math.random() * 100, y: 100 + Math.random() * 100 },
      data: {
        name: "New Agent",
        role: "general",
        adapterType: "blaxel_sandbox",
        onUpdate: handleNodeUpdate,
        onDelete: handleNodeDelete,
      },
    };
    setNodes((nds) => [...nds, newNode]);
    setDirty(true);
  }, [setNodes, handleNodeUpdate, handleNodeDelete]);

  const saveMutation = useMutation({
    mutationFn: (data: OrgChartData) => orgChartApi.save(companyId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.orgChart(companyId) });
      setDirty(false);
    },
  });

  const handleSave = useCallback(() => {
    const payload: OrgChartData = {
      nodes: nodes.map((n) => ({
        id: n.id,
        type: n.type,
        position: n.position,
        data: { name: n.data.name, role: n.data.role, adapterType: n.data.adapterType },
      })),
      edges: edges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        type: e.type,
      })),
      promptToOrg: promptToOrg || undefined,
    };
    saveMutation.mutate(payload);
  }, [nodes, edges, promptToOrg, saveMutation]);

  const nodeTypes: NodeTypes = useMemo(() => ({ agentRole: AgentRoleNode }), []);

  if (isLoading || isOrgLoading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-4rem)] text-sm text-muted-foreground">
        Loading org chart...
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)]">
      {/* Prompt-to-Org panel */}
      {showPrompt && (
        <div className="border-b border-border bg-card px-4 py-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Prompt-to-Org
            </span>
            <Button size="xs" variant="ghost" onClick={() => setShowPrompt(false)}>
              Close
            </Button>
          </div>
          <textarea
            className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm outline-none resize-y min-h-[60px] focus:border-primary"
            placeholder="Describe your org structure in natural language... (e.g. 'A CEO managing a CTO and CMO. The CTO has 3 engineers and 1 QA.')"
            value={promptToOrg}
            onChange={(e) => {
              setPromptToOrg(e.target.value);
              setDirty(true);
            }}
          />
          <p className="text-[11px] text-muted-foreground">
            {/* TODO: LLM generation will parse this prompt and auto-generate nodes/edges */}
            The prompt is saved with the org chart data. Automatic generation from natural language is coming soon.
          </p>
        </div>
      )}

      {/* React Flow canvas */}
      <div className="flex-1 relative">
        <ReactFlow
          nodes={nodesWithCallbacks}
          edges={edges}
          onNodesChange={handleNodesChange}
          onEdgesChange={handleEdgesChange}
          onConnect={onConnect}
          nodeTypes={nodeTypes}
          defaultEdgeOptions={{ type: "smoothstep" }}
          fitView
          deleteKeyCode={["Backspace", "Delete"]}
          className="bg-muted/20"
        >
          <Background gap={20} size={1} />
          <Controls className="!bg-card !border-border !shadow-sm [&>button]:!bg-card [&>button]:!border-border [&>button]:!text-foreground [&>button:hover]:!bg-accent" />
          <MiniMap
            nodeColor="#6366f1"
            maskColor="rgba(0,0,0,0.1)"
            className="!bg-card !border-border"
          />
          <Panel position="top-left" className="flex items-center gap-2">
            <Button size="sm" onClick={addNode}>
              <Plus className="h-4 w-4" />
              Add Node
            </Button>
            <Button
              size="sm"
              variant={showPrompt ? "secondary" : "outline"}
              onClick={() => setShowPrompt(!showPrompt)}
            >
              <MessageSquareText className="h-4 w-4" />
              Prompt-to-Org
            </Button>
          </Panel>
          <Panel position="top-right" className="flex items-center gap-2">
            {dirty && (
              <span className="text-xs text-muted-foreground">Unsaved changes</span>
            )}
            <Button
              size="sm"
              onClick={handleSave}
              disabled={saveMutation.isPending || !dirty}
            >
              <Save className="h-4 w-4" />
              {saveMutation.isPending ? "Saving..." : "Save"}
            </Button>
            {saveMutation.isSuccess && !dirty && (
              <span className="text-xs text-muted-foreground">Saved</span>
            )}
            {saveMutation.isError && (
              <span className="text-xs text-destructive">
                {saveMutation.error instanceof Error
                  ? saveMutation.error.message
                  : "Failed to save"}
              </span>
            )}
          </Panel>
        </ReactFlow>
      </div>
    </div>
  );
}
