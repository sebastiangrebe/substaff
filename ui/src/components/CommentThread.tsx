import { memo, useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { Link, useLocation } from "react-router-dom";
import type { IssueComment, Agent } from "@substaff/shared";
import { Button } from "@/components/ui/button";
import { ExternalLink, Paperclip } from "lucide-react";
import { Identity } from "./Identity";
import { InlineEntitySelector, type InlineEntityOption } from "./InlineEntitySelector";
import { MarkdownBody } from "./MarkdownBody";
import { MarkdownEditor, type MarkdownEditorRef, type MentionOption } from "./MarkdownEditor";
import { StatusBadge } from "./StatusBadge";
import { formatDateTime } from "../lib/utils";

interface CommentWithRunMeta extends IssueComment {
  runId?: string | null;
  runAgentId?: string | null;
}

interface LinkedRunItem {
  runId: string;
  status: string;
  agentId: string;
  createdAt: Date | string;
  startedAt: Date | string | null;
}

interface CommentReassignment {
  assigneeAgentId: string | null;
  assigneeUserId: string | null;
}

interface CommentThreadProps {
  comments: CommentWithRunMeta[];
  linkedRuns?: LinkedRunItem[];
  onAdd: (body: string, reopen?: boolean, reassignment?: CommentReassignment) => Promise<void>;
  issueStatus?: string;
  agentMap?: Map<string, Agent>;
  imageUploadHandler?: (file: File) => Promise<string>;
  /** Callback to attach an image file to the parent issue (not inline in a comment). */
  onAttachImage?: (file: File) => Promise<void>;
  draftKey?: string;
  liveRunSlot?: React.ReactNode;
  enableReassign?: boolean;
  reassignOptions?: InlineEntityOption[];
  currentAssigneeValue?: string;
  mentions?: MentionOption[];
}

const CLOSED_STATUSES = new Set(["done", "cancelled"]);
const DRAFT_DEBOUNCE_MS = 800;

function loadDraft(draftKey: string): string {
  try {
    return localStorage.getItem(draftKey) ?? "";
  } catch {
    return "";
  }
}

function saveDraft(draftKey: string, value: string) {
  try {
    if (value.trim()) {
      localStorage.setItem(draftKey, value);
    } else {
      localStorage.removeItem(draftKey);
    }
  } catch {
    // Ignore localStorage failures.
  }
}

function clearDraft(draftKey: string) {
  try {
    localStorage.removeItem(draftKey);
  } catch {
    // Ignore localStorage failures.
  }
}

function parseReassignment(target: string): CommentReassignment | null {
  if (!target || target === "__none__") {
    return { assigneeAgentId: null, assigneeUserId: null };
  }
  if (target.startsWith("agent:")) {
    const assigneeAgentId = target.slice("agent:".length);
    return assigneeAgentId ? { assigneeAgentId, assigneeUserId: null } : null;
  }
  if (target.startsWith("user:")) {
    const assigneeUserId = target.slice("user:".length);
    return assigneeUserId ? { assigneeAgentId: null, assigneeUserId } : null;
  }
  return null;
}

type TimelineItem =
  | { kind: "comment"; id: string; createdAtMs: number; comment: CommentWithRunMeta }
  | { kind: "run"; id: string; createdAtMs: number; run: LinkedRunItem };

const TimelineList = memo(function TimelineList({
  timeline,
  agentMap,
  highlightCommentId,
}: {
  timeline: TimelineItem[];
  agentMap?: Map<string, Agent>;
  highlightCommentId?: string | null;
}) {
  if (timeline.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-center">
        <div className="h-10 w-10 rounded-full bg-muted/40 flex items-center justify-center mb-3">
          <svg className="h-5 w-5 text-muted-foreground/30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
        </div>
        <p className="text-sm font-medium text-muted-foreground">No activity yet</p>
        <p className="text-xs text-muted-foreground/60 mt-0.5">Comments and agent runs will appear here</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {timeline.map((item) => {
        if (item.kind === "run") {
          const run = item.run;
          return (
            <div key={`run:${run.runId}`} className="flex items-center gap-3 rounded-lg bg-muted/30 px-3.5 py-2.5 min-w-0">
              <Link to={`/agents/${run.agentId}`} className="hover:underline shrink-0">
                <Identity
                  name={agentMap?.get(run.agentId)?.name ?? run.agentId.slice(0, 8)}
                  size="sm"
                />
              </Link>
              <div className="flex items-center gap-2 text-xs min-w-0 flex-1">
                <span className="text-[11px] font-medium text-muted-foreground">Run</span>
                <StatusBadge status={run.status} />
              </div>
              <span className="text-[11px] text-muted-foreground/60 shrink-0 tabular-nums">
                {formatDateTime(run.startedAt ?? run.createdAt)}
              </span>
              <Link
                to={`/agents/${run.agentId}/runs/${run.runId}`}
                className="inline-flex items-center gap-1.5 rounded-md bg-primary/10 px-2.5 py-1 text-[11px] font-medium text-primary hover:bg-primary/20 transition-colors shrink-0"
              >
                <ExternalLink className="h-3 w-3" />
                View run
              </Link>
            </div>
          );
        }

        const comment = item.comment;
        const isHighlighted = highlightCommentId === comment.id;
        return (
          <div
            key={comment.id}
            id={`comment-${comment.id}`}
            className={`rounded-lg border overflow-hidden min-w-0 transition-colors duration-1000 ${isHighlighted ? "border-primary/40 bg-primary/5 shadow-sm" : "border-border/50"}`}
          >
            <div className="flex items-center justify-between px-3.5 py-2.5 bg-muted/20 border-b border-border/30">
              {comment.authorAgentId ? (
                <Link to={`/agents/${comment.authorAgentId}`} className="hover:underline">
                  <Identity
                    name={agentMap?.get(comment.authorAgentId)?.name ?? comment.authorAgentId.slice(0, 8)}
                    size="sm"
                  />
                </Link>
              ) : (
                <Identity name="You" size="sm" />
              )}
              <div className="flex items-center gap-2.5 shrink-0">
                <a
                  href={`#comment-${comment.id}`}
                  className="text-[11px] text-muted-foreground/60 hover:text-foreground hover:underline transition-colors tabular-nums"
                >
                  {formatDateTime(comment.createdAt)}
                </a>
                {comment.runId && comment.runAgentId && (
                  <Link
                    to={`/agents/${comment.runAgentId}/runs/${comment.runId}`}
                    className="inline-flex items-center gap-1.5 rounded-md bg-primary/10 px-2.5 py-1 text-[11px] font-medium text-primary hover:bg-primary/20 transition-colors"
                  >
                    <ExternalLink className="h-3 w-3" />
                    View run
                  </Link>
                )}
              </div>
            </div>
            <div className="px-3.5 py-3">
              <MarkdownBody className="text-sm">{comment.body}</MarkdownBody>
            </div>
          </div>
        );
      })}
    </div>
  );
});

export function CommentThread({
  comments,
  linkedRuns = [],
  onAdd,
  issueStatus,
  agentMap,
  imageUploadHandler,
  onAttachImage,
  draftKey,
  liveRunSlot,
  enableReassign = false,
  reassignOptions = [],
  currentAssigneeValue = "",
  mentions: providedMentions,
}: CommentThreadProps) {
  const [body, setBody] = useState("");
  const [reopen, setReopen] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [attaching, setAttaching] = useState(false);
  const [reassignTarget, setReassignTarget] = useState(currentAssigneeValue);
  const [highlightCommentId, setHighlightCommentId] = useState<string | null>(null);
  const editorRef = useRef<MarkdownEditorRef>(null);
  const attachInputRef = useRef<HTMLInputElement | null>(null);
  const draftTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const location = useLocation();
  const hasScrolledRef = useRef(false);

  const isClosed = issueStatus ? CLOSED_STATUSES.has(issueStatus) : false;

  const timeline = useMemo<TimelineItem[]>(() => {
    const commentItems: TimelineItem[] = comments.map((comment) => ({
      kind: "comment",
      id: comment.id,
      createdAtMs: new Date(comment.createdAt).getTime(),
      comment,
    }));
    const runItems: TimelineItem[] = linkedRuns.map((run) => ({
      kind: "run",
      id: run.runId,
      createdAtMs: new Date(run.startedAt ?? run.createdAt).getTime(),
      run,
    }));
    return [...commentItems, ...runItems].sort((a, b) => {
      if (a.createdAtMs !== b.createdAtMs) return a.createdAtMs - b.createdAtMs;
      if (a.kind === b.kind) return a.id.localeCompare(b.id);
      return a.kind === "comment" ? -1 : 1;
    });
  }, [comments, linkedRuns]);

  // Build mention options from agent map (exclude terminated agents)
  const mentions = useMemo<MentionOption[]>(() => {
    if (providedMentions) return providedMentions;
    if (!agentMap) return [];
    return Array.from(agentMap.values())
      .filter((a) => a.status !== "terminated")
      .map((a) => ({
        id: a.id,
        name: a.name,
      }));
  }, [agentMap, providedMentions]);

  useEffect(() => {
    if (!draftKey) return;
    setBody(loadDraft(draftKey));
  }, [draftKey]);

  useEffect(() => {
    if (!draftKey) return;
    if (draftTimer.current) clearTimeout(draftTimer.current);
    draftTimer.current = setTimeout(() => {
      saveDraft(draftKey, body);
    }, DRAFT_DEBOUNCE_MS);
  }, [body, draftKey]);

  useEffect(() => {
    return () => {
      if (draftTimer.current) clearTimeout(draftTimer.current);
    };
  }, []);

  useEffect(() => {
    setReassignTarget(currentAssigneeValue);
  }, [currentAssigneeValue]);

  // Scroll to comment when URL hash matches #comment-{id}
  useEffect(() => {
    const hash = location.hash;
    if (!hash.startsWith("#comment-") || comments.length === 0) return;
    const commentId = hash.slice("#comment-".length);
    // Only scroll once per hash
    if (hasScrolledRef.current) return;
    const el = document.getElementById(`comment-${commentId}`);
    if (el) {
      hasScrolledRef.current = true;
      setHighlightCommentId(commentId);
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      // Clear highlight after animation
      const timer = setTimeout(() => setHighlightCommentId(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [location.hash, comments]);

  async function handleSubmit() {
    const trimmed = body.trim();
    if (!trimmed) return;
    const hasReassignment = enableReassign && reassignTarget !== currentAssigneeValue;
    const reassignment = hasReassignment ? parseReassignment(reassignTarget) : null;

    setSubmitting(true);
    try {
      await onAdd(trimmed, isClosed && reopen ? true : undefined, reassignment ?? undefined);
      setBody("");
      if (draftKey) clearDraft(draftKey);
      setReopen(false);
      setReassignTarget(currentAssigneeValue);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleAttachFile(evt: ChangeEvent<HTMLInputElement>) {
    const file = evt.target.files?.[0];
    if (!file || !onAttachImage) return;
    setAttaching(true);
    try {
      await onAttachImage(file);
    } finally {
      setAttaching(false);
      if (attachInputRef.current) attachInputRef.current.value = "";
    }
  }

  const canSubmit = !submitting && !!body.trim();

  // Auto-scroll timeline to bottom on initial load
  const timelineRef = useRef<HTMLDivElement>(null);
  const hasAutoScrolled = useRef(false);
  const scrollToBottom = useCallback(() => {
    if (timelineRef.current) {
      timelineRef.current.scrollTop = timelineRef.current.scrollHeight;
    }
  }, []);

  useEffect(() => {
    if (timeline.length > 0 && !hasAutoScrolled.current) {
      hasAutoScrolled.current = true;
      // Small delay to ensure DOM has rendered
      requestAnimationFrame(scrollToBottom);
    }
  }, [timeline.length, scrollToBottom]);

  return (
    <>
      {/* Scrollable timeline with fade indicators */}
      <div className="flex-1 min-h-0 relative flex flex-col">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-6 z-10 bg-gradient-to-b from-card to-transparent" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-6 z-10 bg-gradient-to-t from-card to-transparent" />
        <div ref={timelineRef} className="flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-3">
          <TimelineList timeline={timeline} agentMap={agentMap} highlightCommentId={highlightCommentId} />
          {liveRunSlot}
        </div>
      </div>

      {/* Editor footer — pinned at bottom */}
      <div className="shrink-0 border-t border-border/40 px-4 py-3 bg-card relative z-10">
        <div className="rounded-lg">
          <MarkdownEditor
            ref={editorRef}
            value={body}
            onChange={setBody}
            placeholder="Write a comment..."
            mentions={mentions}
            onSubmit={handleSubmit}
            imageUploadHandler={imageUploadHandler}
            contentClassName="min-h-[60px] text-sm"
          />
          <div className="flex items-center justify-end gap-3 px-3 py-2 border-t border-border/30">
            {onAttachImage && (
              <div className="mr-auto flex items-center gap-3">
                <input
                  ref={attachInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  className="hidden"
                  onChange={handleAttachFile}
                />
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => attachInputRef.current?.click()}
                  disabled={attaching}
                  title="Attach image"
                >
                  <Paperclip className="h-4 w-4" />
                </Button>
              </div>
            )}
            {isClosed && (
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={reopen}
                  onChange={(e) => setReopen(e.target.checked)}
                  className="rounded border-border"
                />
                Re-open
              </label>
            )}
            {enableReassign && reassignOptions.length > 0 && (
              <InlineEntitySelector
                value={reassignTarget}
                options={reassignOptions}
                placeholder="Assignee"
                noneLabel="No assignee"
                searchPlaceholder="Search assignees..."
                emptyMessage="No assignees found."
                onChange={setReassignTarget}
                className="text-xs h-8"
              />
            )}
            <Button size="sm" disabled={!canSubmit} onClick={handleSubmit}>
              {submitting ? "Posting..." : "Comment"}
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
