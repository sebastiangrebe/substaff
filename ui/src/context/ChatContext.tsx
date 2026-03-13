import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { useLocation } from "@/lib/router";

/**
 * Maps route path segments to their chat context key.
 * Only pages with an entry here will keep the chat open.
 * Add new entries as more page-specific chat contexts are built.
 */
const ROUTE_CONTEXT_MAP: Record<string, string> = {
  org: "org:prompt-to-org",
};

/** Derive the chat context key for a given pathname, or null if none. */
function contextKeyForPath(pathname: string): string | null {
  // pathname is like /<companyPrefix>/org, /<companyPrefix>/issues, etc.
  const segments = pathname.split("/").filter(Boolean);
  // The page segment is after the company prefix (index 1)
  const page = segments[1] ?? "";
  return ROUTE_CONTEXT_MAP[page] ?? null;
}

interface ChatContextValue {
  isOpen: boolean;
  contextKey: string | null;
  contextMeta: Record<string, unknown>;
  open: (opts: { contextKey: string; meta?: Record<string, unknown> }) => void;
  close: () => void;
}

const ChatContext = createContext<ChatContextValue | null>(null);

export function ChatProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [contextKey, setContextKey] = useState<string | null>(null);
  const [contextMeta, setContextMeta] = useState<Record<string, unknown>>({});
  const location = useLocation();

  const open = useCallback((opts: { contextKey: string; meta?: Record<string, unknown> }) => {
    setContextKey(opts.contextKey);
    setContextMeta(opts.meta ?? {});
    setIsOpen(true);
  }, []);

  const close = useCallback(() => {
    setIsOpen(false);
    setContextKey(null);
    setContextMeta({});
  }, []);

  // When the route changes while chat is open, switch context or close
  useEffect(() => {
    if (!isOpen) return;

    const newKey = contextKeyForPath(location.pathname);
    if (newKey) {
      // Switch to the new page's context
      if (newKey !== contextKey) {
        setContextKey(newKey);
        setContextMeta({});
      }
    } else {
      // No chat context for this page — close the sidebar
      setIsOpen(false);
      setContextKey(null);
      setContextMeta({});
    }
  }, [location.pathname]); // eslint-disable-line react-hooks/exhaustive-deps -- intentionally only react to path changes

  return (
    <ChatContext.Provider value={{ isOpen, contextKey, contextMeta, open, close }}>
      {children}
    </ChatContext.Provider>
  );
}

export function useChat() {
  const ctx = useContext(ChatContext);
  if (!ctx) {
    throw new Error("useChat must be used within ChatProvider");
  }
  return ctx;
}
