import { X } from "lucide-react";
import type { OrgTemplateDetail } from "../../api/templates";

export interface TeamEdit {
  id: string;
  name: string;
  title: string;
  removed: boolean;
}

interface TeamCustomizerProps {
  template: OrgTemplateDetail;
  edits: TeamEdit[];
  onChange: (edits: TeamEdit[]) => void;
}

export function TeamCustomizer({ template, edits, onChange }: TeamCustomizerProps) {
  function handleNameChange(nodeId: string, newName: string) {
    onChange(
      edits.map((e) => (e.id === nodeId ? { ...e, name: newName } : e))
    );
  }

  function handleRemove(nodeId: string) {
    onChange(
      edits.map((e) => (e.id === nodeId ? { ...e, removed: true } : e))
    );
  }

  function handleRestore(nodeId: string) {
    onChange(
      edits.map((e) => (e.id === nodeId ? { ...e, removed: false } : e))
    );
  }

  const activeEdits = edits.filter((e) => !e.removed);
  const removedEdits = edits.filter((e) => e.removed);

  return (
    <div className="space-y-2">
      {activeEdits.map((edit) => (
        <div
          key={edit.id}
          className="flex items-center gap-2 rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-2"
        >
          <input
            className="flex-1 bg-transparent text-sm text-white outline-none placeholder:text-white/20"
            value={edit.name}
            onChange={(e) => handleNameChange(edit.id, e.target.value)}
          />
          <span className="text-[10px] text-white/30 shrink-0">{edit.title}</span>
          {activeEdits.length > 1 && (
            <button
              onClick={() => handleRemove(edit.id)}
              className="rounded-full p-1 text-white/20 hover:text-red-400 hover:bg-red-500/10 transition-colors"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      ))}

      {removedEdits.length > 0 && (
        <div className="pt-1">
          <p className="text-[10px] text-white/20 mb-1">Removed:</p>
          {removedEdits.map((edit) => (
            <button
              key={edit.id}
              onClick={() => handleRestore(edit.id)}
              className="text-[11px] text-white/25 hover:text-white/50 transition-colors mr-2"
            >
              + {edit.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
