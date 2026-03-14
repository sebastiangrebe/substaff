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

      if (!(e.metaKey || e.ctrlKey)) return;
      if (e.altKey) return;

      // Cmd+1..9 → Switch company
      if (e.key >= "1" && e.key <= "9") {
        e.preventDefault();
        onSwitchCompany?.(parseInt(e.key, 10) - 1);
        return;
      }

      // Cmd+Shift+C → New Task
      if (e.shiftKey && e.key === "c") {
        e.preventDefault();
        onNewIssue?.();
        return;
      }

      // Cmd+Shift+P → New Project
      if (e.shiftKey && e.key === "p") {
        e.preventDefault();
        onNewProject?.();
        return;
      }

      // Cmd+Shift+G → New Goal
      if (e.shiftKey && e.key === "g") {
        e.preventDefault();
        onNewGoal?.();
        return;
      }

      // Cmd+Shift+A → Add Agent
      if (e.shiftKey && e.key === "a") {
        e.preventDefault();
        onNewAgent?.();
        return;
      }

      // Cmd+[ → Toggle Sidebar
      if (e.key === "[") {
        e.preventDefault();
        onToggleSidebar?.();
        return;
      }

      // Cmd+] → Toggle Panel
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
