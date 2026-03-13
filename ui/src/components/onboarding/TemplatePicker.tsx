import { useEffect, useState, useRef, useCallback } from "react";
import { templatesApi, type OrgTemplateDetail } from "../../api/templates";
import { cn } from "../../lib/utils";
import {
  Rocket,
  Megaphone,
  Scale,
  Headphones,
  BarChart3,
  Gamepad2,
  TrendingUp,
  Layout,
  Users,
  Loader2,
} from "lucide-react";

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  rocket: Rocket,
  megaphone: Megaphone,
  scale: Scale,
  headphones: Headphones,
  "bar-chart": BarChart3,
  gamepad: Gamepad2,
  "trending-up": TrendingUp,
  layout: Layout,
};

interface TemplatePickerProps {
  selectedSlug: string | null;
  onSelect: (template: OrgTemplateDetail) => void;
  onSkip: () => void;
}

export function TemplatePicker({ selectedSlug, onSelect, onSkip }: TemplatePickerProps) {
  const [templates, setTemplates] = useState<OrgTemplateDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [canScrollDown, setCanScrollDown] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    templatesApi.list().then((t) => {
      setTemplates(t);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const checkScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 8;
    setCanScrollDown(!atBottom);
  }, []);

  useEffect(() => {
    if (!loading) {
      // Check after render
      requestAnimationFrame(checkScroll);
    }
  }, [loading, checkScroll]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-white/40" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-white/[0.06] flex items-center justify-center">
          <Users className="h-5 w-5 text-white/50" />
        </div>
        <div>
          <h3 className="font-semibold text-white">Choose a template</h3>
          <p className="text-xs text-white/40">
            Pick a company structure to get started fast.
          </p>
        </div>
      </div>

      <div className="relative">
        <div
          ref={scrollRef}
          onScroll={checkScroll}
          className="grid grid-cols-2 gap-2.5 max-h-[380px] overflow-y-auto"
          style={{ scrollbarWidth: "none", msOverflowStyle: "none", WebkitOverflowScrolling: "touch" }}
        >
          {templates.map((template) => {
            const Icon = ICON_MAP[template.icon ?? ""] ?? Users;
            const isSelected = selectedSlug === template.id;

            return (
              <button
                key={template.id}
                onClick={() => onSelect(template)}
                className={cn(
                  "flex flex-col items-start gap-2 rounded-xl border p-3 text-left transition-all",
                  isSelected
                    ? "border-indigo-500/50 bg-indigo-500/10"
                    : "border-white/[0.06] bg-white/[0.03] hover:border-white/[0.12] hover:bg-white/[0.05]"
                )}
              >
                <div className="flex items-center gap-2 w-full">
                  <Icon className="h-4 w-4 text-white/50 shrink-0" />
                  <span className="text-sm font-medium text-white">{template.name}</span>
                </div>
                <p className="text-[11px] text-white/35 leading-relaxed">
                  {template.nodes.map((n) => n.data.label).join(", ")}
                </p>
                <div className="flex items-center gap-2 mt-auto">
                  <span className="text-[10px] bg-white/[0.06] text-white/40 px-1.5 py-0.5 rounded-full">
                    {template.industry}
                  </span>
                  <span className="text-[10px] text-white/30">
                    {template.agentCount} agents
                  </span>
                </div>
              </button>
            );
          })}
        </div>
        {/* Soft fade at the bottom — only visible when more content below */}
        <div
          className={cn(
            "pointer-events-none absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-[rgb(15,15,20)] to-transparent transition-opacity duration-300",
            canScrollDown ? "opacity-100" : "opacity-0"
          )}
        />
      </div>

      <button
        onClick={onSkip}
        className="w-full text-center text-xs text-white/30 hover:text-white/50 transition-colors py-2"
      >
        Skip — I'll build manually
      </button>
    </div>
  );
}
