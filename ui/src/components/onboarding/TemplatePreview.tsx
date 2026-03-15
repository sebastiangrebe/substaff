import type { OrgTemplateDetail } from "../../api/templates";
import { cn } from "../../lib/utils";

interface TemplatePreviewProps {
  template: OrgTemplateDetail;
}

interface TreeNode {
  id: string;
  label: string;
  title: string;
  children: TreeNode[];
}

function buildTree(template: OrgTemplateDetail): TreeNode[] {
  const nodeMap = new Map<string, TreeNode>();

  for (const node of template.nodes) {
    nodeMap.set(node.id, {
      id: node.id,
      label: node.data.label,
      title: node.data.title,
      children: [],
    });
  }

  const roots: TreeNode[] = [];
  const childIds = new Set(template.edges.map((e) => e.target));

  for (const edge of template.edges) {
    const parent = nodeMap.get(edge.source);
    const child = nodeMap.get(edge.target);
    if (parent && child) {
      parent.children.push(child);
    }
  }

  for (const node of template.nodes) {
    if (!childIds.has(node.id)) {
      const treeNode = nodeMap.get(node.id);
      if (treeNode) roots.push(treeNode);
    }
  }

  return roots;
}

function TreeNodeView({ node, depth = 0 }: { node: TreeNode; depth?: number }) {
  return (
    <div>
      <div
        className={cn(
          "flex items-center gap-2 py-1.5 px-2 rounded-lg",
          depth === 0 ? "bg-muted" : "ml-4"
        )}
      >
        <div className={cn(
          "h-1.5 w-1.5 rounded-full shrink-0",
          depth === 0 ? "bg-primary" : "bg-muted-foreground/30"
        )} />
        <div className="min-w-0">
          <p className="text-sm text-foreground truncate">{node.label}</p>
          <p className="text-[10px] text-muted-foreground/60 truncate">{node.title}</p>
        </div>
      </div>
      {node.children.length > 0 && (
        <div className="border-l border-border ml-3 pl-1 mt-0.5">
          {node.children.map((child) => (
            <TreeNodeView key={child.id} node={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

export function TemplatePreview({ template }: TemplatePreviewProps) {
  const tree = buildTree(template);

  return (
    <div className="rounded-xl border border-border bg-muted/30 p-3 space-y-1 max-h-[200px] overflow-y-auto">
      {tree.map((root) => (
        <TreeNodeView key={root.id} node={root} />
      ))}
    </div>
  );
}
