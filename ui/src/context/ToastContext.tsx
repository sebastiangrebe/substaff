import { createContext, useCallback, useContext, useMemo, useRef, type ReactNode } from "react";
import { toast } from "sonner";

export type ToastTone = "info" | "success" | "warn" | "error";

export interface ToastAction {
  label: string;
  href: string;
}

export interface ToastInput {
  id?: string;
  dedupeKey?: string;
  title: string;
  body?: string;
  tone?: ToastTone;
  ttlMs?: number;
  action?: ToastAction;
}

const DEFAULT_TTL_BY_TONE: Record<ToastTone, number> = {
  info: 6000,
  success: 5000,
  warn: 10000,
  error: 15000,
};
const MIN_TTL_MS = 2000;
const MAX_TTL_MS = 20000;
const DEDUPE_WINDOW_MS = 3500;
const DEDUPE_MAX_AGE_MS = 20000;

function normalizeTtl(value: number | undefined, tone: ToastTone) {
  const fallback = DEFAULT_TTL_BY_TONE[tone];
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.max(MIN_TTL_MS, Math.min(MAX_TTL_MS, Math.floor(value)));
}

interface ToastContextValue {
  pushToast: (input: ToastInput) => string | null;
  dismissToast: (id: string) => void;
  clearToasts: () => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const dedupeRef = useRef(new Map<string, number>());

  const pushToast = useCallback((input: ToastInput) => {
    const now = Date.now();
    const tone = input.tone ?? "info";
    const ttlMs = normalizeTtl(input.ttlMs, tone);
    const dedupeKey =
      input.dedupeKey ?? input.id ?? `${tone}|${input.title}|${input.body ?? ""}|${input.action?.href ?? ""}`;

    // Clean up old dedupe entries
    for (const [key, ts] of dedupeRef.current.entries()) {
      if (now - ts > DEDUPE_MAX_AGE_MS) {
        dedupeRef.current.delete(key);
      }
    }

    // Check dedupe
    const lastSeen = dedupeRef.current.get(dedupeKey);
    if (lastSeen && now - lastSeen < DEDUPE_WINDOW_MS) {
      return null;
    }
    dedupeRef.current.set(dedupeKey, now);

    const id = input.id ?? `toast_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    const toastFn =
      tone === "success" ? toast.success
        : tone === "error" ? toast.error
          : tone === "warn" ? toast.warning
            : toast.info;

    toastFn(input.title, {
      id,
      description: input.body,
      duration: ttlMs,
      action: input.action
        ? {
            label: input.action.label,
            onClick: () => {
              window.location.href = input.action!.href;
            },
          }
        : undefined,
    });

    return id;
  }, []);

  const dismissToast = useCallback((id: string) => {
    toast.dismiss(id);
  }, []);

  const clearToasts = useCallback(() => {
    toast.dismiss();
  }, []);

  const value = useMemo<ToastContextValue>(
    () => ({ pushToast, dismissToast, clearToasts }),
    [pushToast, dismissToast, clearToasts],
  );

  return <ToastContext.Provider value={value}>{children}</ToastContext.Provider>;
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return context;
}
