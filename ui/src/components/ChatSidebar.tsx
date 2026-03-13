import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useChat as useAiChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import ReactMarkdown from "react-markdown";
import { X, Send, Loader2, CheckCircle2, RefreshCw, AlertCircle } from "lucide-react";
import { useChat } from "../context/ChatContext";
import { useCompany } from "../context/CompanyContext";
import { usePanel } from "../context/PanelContext";
import { issuesApi } from "../api/issues";
import { agentsApi } from "../api/agents";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "../lib/queryKeys";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

const CONTEXT_TITLES: Record<string, string> = {
  "org:prompt-to-org": "Prompt to Org",
};

export function ChatSidebar() {
  const { isOpen, contextKey, close } = useChat();
  const { selectedCompanyId } = useCompany();
  const { setPanelVisible } = usePanel();

  // Close the properties panel whenever chat opens to prevent overlap
  useEffect(() => {
    if (isOpen) {
      setPanelVisible(false);
    }
  }, [isOpen, setPanelVisible]);

  const showContent = isOpen && !!contextKey && !!selectedCompanyId;

  return (
    <Sheet open={showContent} onOpenChange={(open) => { if (!open) close(); }} modal={false}>
      <SheetContent
        side="right"
        showCloseButton={false}
        showOverlay={false}
        className="w-[400px] sm:max-w-[400px] p-0 z-40 flex flex-col"
        onInteractOutside={(e) => e.preventDefault()}
      >
        {showContent && (
          <ChatSidebarInner
            key={`${contextKey}-${selectedCompanyId}`}
            contextKey={contextKey}
            companyId={selectedCompanyId}
            onClose={close}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}

function ChatSidebarInner({
  contextKey,
  companyId,
  onClose,
}: {
  contextKey: string;
  companyId: string;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [input, setInput] = useState("");
  const title = CONTEXT_TITLES[contextKey] ?? "Chat";

  const { data: agents } = useQuery({
    queryKey: queryKeys.agents.list(companyId),
    queryFn: () => agentsApi.list(companyId),
    enabled: !!companyId,
  });

  const ceoAgent = agents?.find(
    (a) => a.role === "ceo" || a.role === "CEO" || a.name.toLowerCase().includes("ceo"),
  );

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: `/api/companies/${companyId}/chat`,
        body: { contextKey },
        credentials: "include",
      }),
    [companyId, contextKey],
  );

  const {
    messages,
    sendMessage,
    status,
    error,
    regenerate,
  } = useAiChat({ transport });

  const isLoading = status === "submitted" || status === "streaming";

  // Auto-scroll on new messages
  useEffect(() => {
    const el = scrollRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages]);

  const handleCreateTask = useCallback(
    async (toolCall: { title: string; description: string; priority: string }) => {
      if (!ceoAgent) return;
      try {
        await issuesApi.create(companyId, {
          title: toolCall.title,
          description: toolCall.description,
          priority: toolCall.priority,
          assigneeAgentId: ceoAgent.id,
          status: "todo",
        });
        queryClient.invalidateQueries({ queryKey: queryKeys.issues.list(companyId) });
      } catch {
        // Error handled by UI
      }
    },
    [companyId, ceoAgent, queryClient],
  );

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || isLoading) return;
    setInput("");
    sendMessage({ text });
  };

  return (
    <>
      {/* Header */}
      <SheetHeader className="flex-row items-center justify-between px-4 py-3 border-b border-border shrink-0 space-y-0">
        <SheetTitle className="text-sm">{title}</SheetTitle>
        <Button size="icon-xs" variant="ghost" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </SheetHeader>

      {/* Messages */}
      <ScrollArea ref={scrollRef} className="flex-1 min-h-0">
        <div className="p-4 space-y-4">
          {messages.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8">
              Describe the org changes you'd like to make.
            </p>
          )}
          {messages.map((message) => (
            <div key={message.id}>
              {message.role === "user" ? (
                <div className="flex justify-end">
                  <div className="bg-primary text-primary-foreground rounded-lg px-3 py-2 max-w-[85%] text-sm">
                    {message.parts?.map((part, i) => {
                      if (part.type === "text") return <span key={i}>{part.text}</span>;
                      return null;
                    })}
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  {/* Render text parts first, then tool cards below */}
                  {message.parts?.filter((p) => p.type === "text" && (p as { text?: string }).text).map((part, i) => (
                    <div key={`text-${i}`} className="bg-muted rounded-lg px-3 py-2 max-w-[85%] text-sm prose prose-sm dark:prose-invert">
                      <ReactMarkdown>{(part as { text: string }).text}</ReactMarkdown>
                    </div>
                  ))}
                  {message.parts?.filter((p) => p.type === "tool-propose_org_changes").map((part, i) => {
                    const inv = part as unknown as {
                      toolCallId: string;
                      input: Record<string, unknown> | undefined;
                      state: string;
                    };
                    if (!inv.input?.title) {
                      return (
                        <div key={inv.toolCallId ?? `tool-${i}`} className="flex items-center gap-2 text-muted-foreground text-sm">
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          Preparing proposal...
                        </div>
                      );
                    }
                    return (
                      <TaskPreviewCard
                        key={inv.toolCallId ?? `tool-${i}`}
                        title={inv.input.title as string}
                        description={(inv.input.description as string) ?? ""}
                        priority={(inv.input.priority as string) ?? "medium"}
                        ceoName={ceoAgent?.name ?? null}
                        onCreateTask={() =>
                          handleCreateTask({
                            title: inv.input!.title as string,
                            description: (inv.input!.description as string) ?? "",
                            priority: (inv.input!.priority as string) ?? "medium",
                          })
                        }
                      />
                    );
                  })}
                </div>
              )}
            </div>
          ))}
          {isLoading && (
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Thinking...
            </div>
          )}
          {error && (
            <div className="flex items-center gap-2 text-destructive text-sm">
              <AlertCircle className="h-3.5 w-3.5" />
              <span className="flex-1">
                {error.message.includes("422")
                  ? "LLM not configured. Set an Anthropic API key in company settings."
                  : "Something went wrong."}
              </span>
              <Button size="icon-xs" variant="ghost" onClick={() => regenerate()}>
                <RefreshCw className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Input */}
      <form
        onSubmit={handleSubmit}
        className="border-t border-border p-3 flex items-center gap-2 shrink-0"
      >
        <input
          ref={inputRef}
          autoFocus
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Describe org changes..."
          className="flex-1 bg-muted rounded-md px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary"
          disabled={isLoading}
        />
        <Button type="submit" size="icon-sm" disabled={isLoading || !input.trim()}>
          <Send className="h-4 w-4" />
        </Button>
      </form>
    </>
  );
}

function TaskPreviewCard({
  title,
  description,
  priority,
  ceoName,
  onCreateTask,
}: {
  title: string;
  description: string;
  priority: string;
  ceoName: string | null;
  onCreateTask: () => void;
}) {
  const [created, setCreated] = useState(false);
  const [creating, setCreating] = useState(false);

  const handleCreate = async () => {
    if (!ceoName) return;
    setCreating(true);
    try {
      await onCreateTask();
      setCreated(true);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="border border-border rounded-lg p-3 bg-card space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">{title}</span>
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground uppercase">
          {priority}
        </span>
      </div>
      <p className="text-xs text-muted-foreground whitespace-pre-wrap">{description}</p>
      {ceoName && (
        <p className="text-[11px] text-muted-foreground">
          Assigned to: <span className="font-medium text-foreground">{ceoName}</span>
        </p>
      )}
      <div className="flex items-center gap-2">
        {created ? (
          <span className="text-xs text-green-600 flex items-center gap-1">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Task created
          </span>
        ) : (
          <Button
            size="xs"
            onClick={handleCreate}
            disabled={creating || !ceoName}
          >
            {creating ? "Creating..." : "Create Task"}
          </Button>
        )}
        {!ceoName && (
          <span className="text-xs text-amber-500">No CEO agent found</span>
        )}
      </div>
    </div>
  );
}
