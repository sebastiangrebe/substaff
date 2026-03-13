import { useEffect } from "react";

interface ShortcutHandlers {
  onNewIssue?: () => void;
  onNewProject?: () => void;
  onNewGoal?: () => void;
  onNewAgent?: () => void;
  onToggleSidebar?: () => void;
  onTogglePanel?: () => void;
  onSwitchCompany?: (index: number) => void;
  disabled?: boolean;
}

export function useKeyboardShortcuts({ onNewIssue, onNewProject, onNewGoal, onNewAgent, onToggleSidebar, onTogglePanel, onSwitchCompany, disabled }: ShortcutHandlers) {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (disabled) return;

      // Don't fire shortcuts when typing in inputs
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) {
        return;
      }

      // Cmd+1..9 → Switch company
      if ((e.metaKey || e.ctrlKey) && e.key >= "1" && e.key <= "9") {
        e.preventDefault();
        onSwitchCompany?.(parseInt(e.key, 10) - 1);
        return;
      }

      if (e.metaKey || e.ctrlKey || e.altKey) return;

      // C → New Task
      if (e.key === "c") {
        e.preventDefault();
        onNewIssue?.();
        return;
      }

      // P → New Project
      if (e.key === "p") {
        e.preventDefault();
        onNewProject?.();
        return;
      }

      // G → New Goal
      if (e.key === "g") {
        e.preventDefault();
        onNewGoal?.();
        return;
      }

      // A → Add Agent
      if (e.key === "a") {
        e.preventDefault();
        onNewAgent?.();
        return;
      }

      // [ → Toggle Sidebar
      if (e.key === "[") {
        e.preventDefault();
        onToggleSidebar?.();
        return;
      }

      // ] → Toggle Panel
      if (e.key === "]") {
        e.preventDefault();
        onTogglePanel?.();
        return;
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onNewIssue, onNewProject, onNewGoal, onNewAgent, onToggleSidebar, onTogglePanel, onSwitchCompany, disabled]);
}
