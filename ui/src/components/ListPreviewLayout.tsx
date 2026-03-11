import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "@/lib/router";
import { cn } from "../lib/utils";
import { X, ArrowRight } from "lucide-react";

interface ListPreviewLayoutProps {
  children: ReactNode;
  previewContent: ReactNode | null;
  previewKey: string | null;
  detailUrl: string | null;
  /** Called before navigating — seed the query cache so detail page skips skeleton */
  onBeforeNavigate?: () => void;
  onPreviewClose: () => void;
  /** Keep the panel always visible (no hide on mouse leave). */
  alwaysOpen?: boolean;
}

/**
 * Two-pane layout for list pages: main list on left, preview panel on right.
 * Click panel → navigates with viewTransition: true for element-level morphing.
 */
export function ListPreviewLayout({
  children,
  previewContent,
  previewKey,
  detailUrl,
  onBeforeNavigate,
  onPreviewClose,
  alwaysOpen,
}: ListPreviewLayoutProps) {
  const navigate = useNavigate();
  const [isVisible, setIsVisible] = useState(false);
  const [renderedContent, setRenderedContent] = useState<ReactNode | null>(null);
  const [renderedKey, setRenderedKey] = useState<string | null>(null);
  const [mouseInPanel, setMouseInPanel] = useState(false);
  const hideTimeout = useRef<ReturnType<typeof setTimeout>>(undefined);
  const showTimeout = useRef<ReturnType<typeof setTimeout>>(undefined);
  // Persist values so they survive after row hover ends (mouse enters panel)
  const activeDetailUrl = useRef<string | null>(null);
  const activeBeforeNavigate = useRef<(() => void) | undefined>(undefined);
  useEffect(() => {
    if (detailUrl) activeDetailUrl.current = detailUrl;
    if (onBeforeNavigate) activeBeforeNavigate.current = onBeforeNavigate;
  }, [detailUrl, onBeforeNavigate]);

  useEffect(() => {
    if (previewContent && previewKey) {
      clearTimeout(hideTimeout.current);
      clearTimeout(showTimeout.current);
      setRenderedContent(previewContent);
      setRenderedKey(previewKey);
      showTimeout.current = setTimeout(() => setIsVisible(true), 60);
      return () => clearTimeout(showTimeout.current);
    } else if (!mouseInPanel && !alwaysOpen) {
      clearTimeout(showTimeout.current);
      hideTimeout.current = setTimeout(() => {
        setIsVisible(false);
        setTimeout(() => {
          setRenderedContent(null);
          setRenderedKey(null);
          activeDetailUrl.current = null;
          activeBeforeNavigate.current = undefined;
        }, 250);
      }, 200);
      return () => clearTimeout(hideTimeout.current);
    }
  }, [previewContent, previewKey, mouseInPanel, alwaysOpen]);

  const handlePanelMouseEnter = useCallback(() => {
    setMouseInPanel(true);
    clearTimeout(hideTimeout.current);
  }, []);

  const handlePanelMouseLeave = useCallback(() => {
    setMouseInPanel(false);
    if (!previewContent && !alwaysOpen) {
      hideTimeout.current = setTimeout(() => {
        setIsVisible(false);
        setTimeout(() => {
          setRenderedContent(null);
          setRenderedKey(null);
          activeDetailUrl.current = null;
          activeBeforeNavigate.current = undefined;
        }, 250);
      }, 200);
    }
  }, [previewContent, alwaysOpen]);

  const handlePanelClick = useCallback(() => {
    const url = activeDetailUrl.current;
    if (!url) return;

    // Seed cache so detail page renders content immediately (no skeleton)
    activeBeforeNavigate.current?.();

    // React Router data router supports viewTransition natively.
    // It wraps navigation in document.startViewTransition(), capturing old snapshot
    // (panel with viewTransitionName elements) then new snapshot (detail page with
    // matching viewTransitionName elements) and morphing them.
    navigate(url, { viewTransition: true });
  }, [navigate]);

  const handleClose = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setMouseInPanel(false);
    setIsVisible(false);
    setTimeout(() => {
      setRenderedContent(null);
      setRenderedKey(null);
      activeDetailUrl.current = null;
      activeBeforeNavigate.current = undefined;
    }, 250);
    onPreviewClose();
  }, [onPreviewClose]);

  const hasPreview = renderedContent !== null;

  return (
    <>
      {/* List pane — shrink when panel is open so content doesn't go behind it */}
      <div
        className={cn(
          "min-w-0 transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]",
          hasPreview ? "lg:mr-[380px]" : "",
        )}
      >
        {children}
      </div>

      {/* Preview panel — fixed to viewport right edge, lg+ only */}
      <div
        className={cn(
          "fixed top-0 right-0 bottom-0 z-30 transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] overflow-hidden hidden lg:block",
          hasPreview ? "w-[380px]" : "w-0",
        )}
        onMouseEnter={handlePanelMouseEnter}
        onMouseLeave={handlePanelMouseLeave}
      >
        <div
          className={cn(
            "w-[380px] h-full overflow-hidden flex flex-col border-l border-border/50 bg-card/50",
            "transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]",
            isVisible
              ? "translate-x-0 opacity-100"
              : "translate-x-8 opacity-0",
          )}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border/50 shrink-0">
            <span className="text-[11px] font-medium text-muted-foreground/60 select-none">
              Quick preview
            </span>
            {!alwaysOpen && (
              <button
                className="p-1 rounded-md text-muted-foreground/40 hover:text-muted-foreground hover:bg-accent/40 transition-colors"
                onClick={handleClose}
                aria-label="Close preview"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Scrollable content */}
          <div
            className="flex-1 overflow-y-auto cursor-pointer px-4 py-4"
            onClick={handlePanelClick}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") handlePanelClick();
            }}
          >
            {renderedContent}
          </div>

          {/* Footer */}
          <div
            className="border-t border-border/50 px-4 py-2.5 shrink-0 cursor-pointer flex items-center justify-between"
            onClick={handlePanelClick}
          >
            <span className="text-[11px] text-muted-foreground/50 select-none">
              Click to open full details
            </span>
            <ArrowRight className="h-3 w-3 text-muted-foreground/30" />
          </div>
        </div>
      </div>
    </>
  );
}
