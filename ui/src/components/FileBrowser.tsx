import { useState, useCallback, useMemo, useRef, useEffect, type DragEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChevronRight,
  Download,
  Folder,
  File,
  FileCode,
  FileText,
  FileImage,
  FileJson,
  FileArchive,
  ArrowLeft,
  Search,
  Upload,
  LayoutGrid,
  LayoutList,
  FolderOpen,
  Bot,
  Trash2,
  Copy,
  ExternalLink,
  MoreHorizontal,
  X,
  CheckCircle2,
  AlertCircle,
  FileUp,
  Sparkles,
  FolderPlus,
} from "lucide-react";
import { filesApi, type FileEntry } from "../api/files";
import { queryKeys } from "../lib/queryKeys";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const CODE_EXTENSIONS = new Set([
  "ts", "tsx", "js", "jsx", "py", "go", "rs", "rb", "java", "c", "cpp", "h",
  "css", "scss", "html", "xml", "yaml", "yml", "toml", "sh", "bash", "zsh",
  "sql", "graphql", "vue", "svelte", "swift", "kt", "scala",
]);

const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "gif", "webp", "svg", "ico", "bmp"]);

const ARCHIVE_EXTENSIONS = new Set(["zip", "tar", "gz", "bz2", "xz", "7z", "rar"]);

function getExtension(key: string): string {
  const parts = key.split(".");
  return parts.length > 1 ? (parts.pop() ?? "").toLowerCase() : "";
}

function getFileName(key: string): string {
  const withoutTrailingSlash = key.endsWith("/") ? key.slice(0, -1) : key;
  const parts = withoutTrailingSlash.split("/");
  return parts[parts.length - 1] || key;
}

type FileType = "folder" | "code" | "image" | "archive" | "json" | "text" | "file";

function getFileType(entry: FileEntry): FileType {
  if (entry.isFolder) return "folder";
  const ext = getExtension(entry.key);
  if (CODE_EXTENSIONS.has(ext)) return "code";
  if (IMAGE_EXTENSIONS.has(ext)) return "image";
  if (ARCHIVE_EXTENSIONS.has(ext)) return "archive";
  if (ext === "json") return "json";
  if (ext === "md" || ext === "txt" || ext === "log" || ext === "csv") return "text";
  return "file";
}

function getFileIcon(type: FileType) {
  switch (type) {
    case "folder": return Folder;
    case "code": return FileCode;
    case "image": return FileImage;
    case "archive": return FileArchive;
    case "json": return FileJson;
    case "text": return FileText;
    default: return File;
  }
}

function getFileIconColor(type: FileType): string {
  switch (type) {
    case "folder": return "text-blue-500";
    case "code": return "text-emerald-500";
    case "image": return "text-violet-500";
    case "archive": return "text-amber-500";
    case "json": return "text-orange-500";
    case "text": return "text-sky-500";
    default: return "text-muted-foreground";
  }
}

function getFileIconBg(type: FileType): string {
  switch (type) {
    case "folder": return "bg-blue-500/10";
    case "code": return "bg-emerald-500/10";
    case "image": return "bg-violet-500/10";
    case "archive": return "bg-amber-500/10";
    case "json": return "bg-orange-500/10";
    case "text": return "bg-sky-500/10";
    default: return "bg-muted/50";
  }
}

function formatSize(bytes: number): string {
  if (bytes === 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;

  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: d.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
  });
}

function formatDateFull(dateStr: string | null): string {
  if (!dateStr) return "";
  return new Date(dateStr).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function isPreviewableText(ext: string): boolean {
  return CODE_EXTENSIONS.has(ext) || ["json", "md", "txt", "log", "csv", "env", "cfg", "ini", "conf"].includes(ext);
}

// ---------------------------------------------------------------------------
// Upload state
// ---------------------------------------------------------------------------

interface UploadItem {
  id: string;
  file: File;
  status: "pending" | "uploading" | "done" | "error";
  progress: number;
  error?: string;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function BreadcrumbNav({
  prefix,
  onNavigate,
}: {
  prefix: string;
  onNavigate: (prefix: string) => void;
}) {
  const parts = prefix.split("/").filter(Boolean);
  const crumbs = parts.map((part, i) => ({
    label: part,
    prefix: parts.slice(0, i + 1).join("/") + "/",
  }));

  return (
    <div className="flex items-center gap-0.5 text-sm min-w-0">
      <button
        onClick={() => onNavigate("")}
        className={cn(
          "flex items-center gap-1.5 px-2 py-1 rounded-md transition-colors text-sm font-medium",
          prefix === "" ? "text-foreground" : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
        )}
      >
        <FolderOpen className="h-3.5 w-3.5 shrink-0" />
        <span>Root</span>
      </button>
      {crumbs.map((crumb, i) => (
        <span key={crumb.prefix} className="flex items-center gap-0.5 min-w-0">
          <ChevronRight className="h-3 w-3 text-muted-foreground/50 shrink-0" />
          <button
            onClick={() => onNavigate(crumb.prefix)}
            className={cn(
              "px-2 py-1 rounded-md transition-colors text-sm truncate max-w-[160px]",
              i === crumbs.length - 1
                ? "font-medium text-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
            )}
          >
            {crumb.label}
          </button>
        </span>
      ))}
    </div>
  );
}

function UploadProgress({ uploads, onDismiss }: { uploads: UploadItem[]; onDismiss: () => void }) {
  const active = uploads.filter((u) => u.status === "uploading" || u.status === "pending");
  const done = uploads.filter((u) => u.status === "done");
  const errors = uploads.filter((u) => u.status === "error");

  if (uploads.length === 0) return null;

  return (
    <div className="border border-border rounded-lg bg-card overflow-hidden shadow-sm animate-in slide-in-from-bottom-2 duration-300">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-muted/30">
        <div className="flex items-center gap-2 text-sm">
          {active.length > 0 ? (
            <>
              <FileUp className="h-3.5 w-3.5 text-primary animate-pulse" />
              <span className="font-medium">Uploading {active.length} file{active.length !== 1 ? "s" : ""}...</span>
            </>
          ) : errors.length > 0 ? (
            <>
              <AlertCircle className="h-3.5 w-3.5 text-destructive" />
              <span className="font-medium">{errors.length} failed, {done.length} uploaded</span>
            </>
          ) : (
            <>
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
              <span className="font-medium">{done.length} file{done.length !== 1 ? "s" : ""} uploaded</span>
            </>
          )}
        </div>
        <Button variant="ghost" size="icon-xs" onClick={onDismiss}>
          <X className="h-3 w-3" />
        </Button>
      </div>
      <div className="max-h-[120px] overflow-y-auto">
        {uploads.map((u) => (
          <div key={u.id} className="flex items-center gap-2 px-3 py-1.5 text-xs">
            {u.status === "uploading" && <div className="h-3 w-3 rounded-full border-2 border-primary border-t-transparent animate-spin shrink-0" />}
            {u.status === "pending" && <div className="h-3 w-3 rounded-full bg-muted shrink-0" />}
            {u.status === "done" && <CheckCircle2 className="h-3 w-3 text-emerald-500 shrink-0" />}
            {u.status === "error" && <AlertCircle className="h-3 w-3 text-destructive shrink-0" />}
            <span className="truncate flex-1 text-muted-foreground">{u.file.name}</span>
            <span className="text-muted-foreground/60 tabular-nums shrink-0">{formatSize(u.file.size)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function FilePreviewPanel({
  companyId,
  fileKey,
  onClose,
  onDownload,
  onDelete,
}: {
  companyId: string;
  fileKey: string;
  onClose: () => void;
  onDownload: () => void;
  onDelete: () => void;
}) {
  const ext = getExtension(fileKey);
  const isImage = IMAGE_EXTENSIONS.has(ext);
  const isText = isPreviewableText(ext);
  const contentUrl = filesApi.getContentUrl(companyId, fileKey);
  const fileName = getFileName(fileKey);
  const type = getFileType({ key: fileKey, size: 0, lastModified: null, isFolder: false });

  const { data: textContent, isLoading } = useQuery({
    queryKey: ["file-content", companyId, fileKey],
    queryFn: async () => {
      const res = await fetch(contentUrl, { credentials: "include" });
      if (!res.ok) throw new Error(`Failed to load file: ${res.status}`);
      return res.text();
    },
    enabled: isText,
  });

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-[480px] sm:max-w-[480px] p-0 flex flex-col">
        <SheetHeader className="px-4 pt-4 pb-3 border-b border-border space-y-0">
          <div className="flex items-center gap-3">
            <div className={cn("h-9 w-9 rounded-lg flex items-center justify-center shrink-0", getFileIconBg(type))}>
              {(() => { const Icon = getFileIcon(type); return <Icon className={cn("h-4.5 w-4.5", getFileIconColor(type))} />; })()}
            </div>
            <div className="min-w-0 flex-1">
              <SheetTitle className="text-sm truncate">{fileName}</SheetTitle>
              <p className="text-xs text-muted-foreground mt-0.5">.{ext} file</p>
            </div>
          </div>
          <div className="flex items-center gap-1 pt-2">
            <Button variant="outline" size="xs" onClick={onDownload}>
              <Download className="h-3 w-3" />
              Download
            </Button>
            <Button variant="outline" size="xs" onClick={() => navigator.clipboard.writeText(window.location.origin + contentUrl)}>
              <Copy className="h-3 w-3" />
              Copy link
            </Button>
            <Button variant="outline" size="xs" className="text-destructive hover:text-destructive" onClick={onDelete}>
              <Trash2 className="h-3 w-3" />
              Delete
            </Button>
          </div>
        </SheetHeader>
        <ScrollArea className="flex-1">
          <div className="p-4">
            {isImage && (
              <div className="rounded-lg overflow-hidden border border-border bg-muted/20">
                <img
                  src={contentUrl}
                  alt={fileName}
                  className="max-w-full h-auto"
                />
              </div>
            )}
            {isText && isLoading && (
              <div className="space-y-2">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-4 w-5/6" />
              </div>
            )}
            {isText && !isLoading && textContent !== undefined && (
              <pre className="text-xs leading-relaxed font-mono whitespace-pre-wrap break-words text-foreground bg-muted/30 p-4 rounded-lg border border-border overflow-x-auto">
                {textContent}
              </pre>
            )}
            {!isImage && !isText && (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className={cn("h-16 w-16 rounded-xl flex items-center justify-center mb-4", getFileIconBg(type))}>
                  {(() => { const Icon = getFileIcon(type); return <Icon className={cn("h-8 w-8", getFileIconColor(type))} />; })()}
                </div>
                <p className="text-sm font-medium mb-1">{fileName}</p>
                <p className="text-xs text-muted-foreground mb-4">Preview not available for .{ext} files</p>
                <Button variant="outline" size="sm" onClick={onDownload}>
                  <Download className="h-3.5 w-3.5" />
                  Download file
                </Button>
              </div>
            )}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}

function EmptyWorkspace({ onUpload }: { onUpload: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6">
      {/* Animated workspace illustration */}
      <div className="relative mb-6">
        <div className="h-20 w-20 rounded-2xl bg-gradient-to-br from-primary/10 to-primary/5 flex items-center justify-center border border-primary/10">
          <FolderOpen className="h-9 w-9 text-primary/40" />
        </div>
        {/* Orbiting agent indicator */}
        <div className="absolute -top-1 -right-1 h-7 w-7 rounded-full bg-card border-2 border-primary/20 flex items-center justify-center shadow-sm">
          <Bot className="h-3.5 w-3.5 text-primary/60" />
        </div>
        {/* Sparkle indicators */}
        <div className="absolute -bottom-1 -left-1">
          <Sparkles className="h-4 w-4 text-amber-400/60" />
        </div>
      </div>

      <h3 className="text-sm font-semibold mb-1.5">Your agents' workspace</h3>
      <p className="text-xs text-muted-foreground text-center max-w-[280px] leading-relaxed mb-5">
        This is where your AI agents create, share, and collaborate on files. Upload files to get started, or let your agents begin working.
      </p>

      <div className="flex items-center gap-2">
        <Button size="sm" onClick={onUpload}>
          <Upload className="h-3.5 w-3.5" />
          Upload files
        </Button>
        <Button size="sm" variant="outline" onClick={onUpload}>
          <FolderPlus className="h-3.5 w-3.5" />
          Create folder
        </Button>
      </div>

      {/* Subtle hint about agent activity */}
      <div className="mt-8 flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/30 border border-border/50">
        <div className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
        <span className="text-xs text-muted-foreground">Agents will automatically create files here as they work</span>
      </div>
    </div>
  );
}

function FileGridCard({
  entry,
  companyId,
  isSelected,
  onSelect,
  onClick,
  onContextAction,
}: {
  entry: FileEntry;
  companyId: string;
  isSelected: boolean;
  onSelect: (checked: boolean) => void;
  onClick: () => void;
  onContextAction: (action: string) => void;
}) {
  const name = getFileName(entry.key);
  const type = getFileType(entry);
  const Icon = getFileIcon(type);
  const isImage = IMAGE_EXTENSIONS.has(getExtension(entry.key));
  const contentUrl = isImage ? filesApi.getContentUrl(companyId, entry.key) : null;

  return (
    <div
      className={cn(
        "group relative border border-border rounded-lg bg-card hover:border-primary/30 hover:shadow-sm transition-all cursor-pointer",
        isSelected && "border-primary/50 ring-1 ring-primary/20 bg-primary/[0.02]"
      )}
      onClick={onClick}
    >
      {/* Selection checkbox */}
      <div
        className={cn(
          "absolute top-2 left-2 z-10 transition-opacity",
          isSelected ? "opacity-100" : "opacity-0 group-hover:opacity-100"
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <Checkbox
          checked={isSelected}
          onCheckedChange={onSelect}
        />
      </div>

      {/* Context menu */}
      <div className="absolute top-2 right-2 z-10 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-xs" className="h-6 w-6">
              <MoreHorizontal className="h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onContextAction("download")}>
              <Download className="h-3.5 w-3.5" />
              Download
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onContextAction("copyLink")}>
              <Copy className="h-3.5 w-3.5" />
              Copy link
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onContextAction("openNew")}>
              <ExternalLink className="h-3.5 w-3.5" />
              Open in new tab
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onClick={() => onContextAction("delete")}>
              <Trash2 className="h-3.5 w-3.5" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Preview area */}
      <div className="h-24 flex items-center justify-center rounded-t-lg overflow-hidden">
        {isImage && contentUrl ? (
          <img
            src={contentUrl}
            alt={name}
            className="h-full w-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className={cn("h-11 w-11 rounded-lg flex items-center justify-center", getFileIconBg(type))}>
            <Icon className={cn("h-5.5 w-5.5", getFileIconColor(type))} />
          </div>
        )}
      </div>

      {/* Info */}
      <div className="px-2.5 py-2 border-t border-border/50">
        <p className="text-sm truncate">{name}</p>
        <div className="flex items-center justify-between mt-1">
          <span className="text-xs text-muted-foreground">{formatSize(entry.size)}</span>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="text-xs text-muted-foreground">{formatDate(entry.lastModified)}</span>
            </TooltipTrigger>
            {entry.lastModified && (
              <TooltipContent>{formatDateFull(entry.lastModified)}</TooltipContent>
            )}
          </Tooltip>
        </div>
      </div>
    </div>
  );
}

function FileListRow({
  entry,
  companyId,
  isSelected,
  onSelect,
  onClick,
  onContextAction,
}: {
  entry: FileEntry;
  companyId: string;
  isSelected: boolean;
  onSelect: (checked: boolean) => void;
  onClick: () => void;
  onContextAction: (action: string) => void;
}) {
  const name = getFileName(entry.key);
  const type = getFileType(entry);
  const Icon = getFileIcon(type);

  return (
    <div
      className={cn(
        "group flex items-center px-3 py-[7px] text-sm transition-colors cursor-pointer border-b border-border/50 last:border-b-0",
        isSelected
          ? "bg-primary/[0.03]"
          : "hover:bg-accent/50",
      )}
      onClick={onClick}
    >
      {/* Icon with checkbox overlay */}
      <div className="relative h-7 w-7 shrink-0 mr-2.5">
        <div className={cn(
          "absolute inset-0 rounded-md flex items-center justify-center transition-opacity",
          isSelected ? "opacity-0" : "opacity-100 group-hover:opacity-0",
          getFileIconBg(type),
        )}>
          <Icon className={cn("h-3.5 w-3.5", getFileIconColor(type))} />
        </div>
        <div
          className={cn(
            "absolute inset-0 flex items-center justify-center transition-opacity",
            isSelected ? "opacity-100" : "opacity-0 group-hover:opacity-100"
          )}
          onClick={(e) => e.stopPropagation()}
        >
          <Checkbox
            checked={isSelected}
            onCheckedChange={onSelect}
          />
        </div>
      </div>

      {/* Name */}
      <div className="flex items-center min-w-0 flex-1">
        <span className="truncate">{name}</span>
      </div>

      {/* Size */}
      <span className="w-[90px] text-right text-xs text-muted-foreground tabular-nums shrink-0">
        {entry.isFolder ? "" : formatSize(entry.size)}
      </span>

      {/* Modified */}
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="w-[120px] text-right text-xs text-muted-foreground shrink-0">
            {entry.lastModified ? formatDate(entry.lastModified) : ""}
          </span>
        </TooltipTrigger>
        {entry.lastModified && (
          <TooltipContent>{formatDateFull(entry.lastModified)}</TooltipContent>
        )}
      </Tooltip>

      {/* Actions */}
      <div className="w-9 flex items-center justify-center shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-xs" className="h-6 w-6">
              <MoreHorizontal className="h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onContextAction("download")}>
              <Download className="h-3.5 w-3.5" />
              Download
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onContextAction("copyLink")}>
              <Copy className="h-3.5 w-3.5" />
              Copy link
            </DropdownMenuItem>
            {!entry.isFolder && (
              <DropdownMenuItem onClick={() => onContextAction("openNew")}>
                <ExternalLink className="h-3.5 w-3.5" />
                Open in new tab
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onClick={() => onContextAction("delete")}>
              <Trash2 className="h-3.5 w-3.5" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

function DropZoneOverlay() {
  return (
    <div className="absolute inset-0 z-20 bg-primary/5 border-2 border-dashed border-primary/40 rounded-lg flex flex-col items-center justify-center backdrop-blur-[1px] pointer-events-none animate-in fade-in duration-200">
      <div className="h-14 w-14 rounded-xl bg-primary/10 flex items-center justify-center mb-3">
        <Upload className="h-7 w-7 text-primary" />
      </div>
      <p className="text-sm font-semibold text-primary">Drop files here</p>
      <p className="text-xs text-muted-foreground mt-1">Files will be uploaded to the current directory</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface FileBrowserProps {
  companyId: string;
}

export function FileBrowser({ companyId }: FileBrowserProps) {
  const [currentPrefix, setCurrentPrefix] = useState("");
  const [previewFile, setPreviewFile] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"list" | "grid">("list");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [isDragOver, setIsDragOver] = useState(false);
  const [uploads, setUploads] = useState<UploadItem[]>([]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragCountRef = useRef(0);
  const queryClient = useQueryClient();

  const { data: entries, isLoading, error } = useQuery({
    queryKey: queryKeys.files(companyId, currentPrefix),
    queryFn: () => filesApi.list(companyId, currentPrefix),
    enabled: !!companyId,
  });

  const sortedEntries = useMemo(() => {
    if (!entries) return [];
    let filtered = [...entries];
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter((e) => getFileName(e.key).toLowerCase().includes(q));
    }
    return filtered.sort((a, b) => {
      if (a.isFolder && !b.isFolder) return -1;
      if (!a.isFolder && b.isFolder) return 1;
      return getFileName(a.key).localeCompare(getFileName(b.key));
    });
  }, [entries, searchQuery]);

  const stats = useMemo(() => {
    if (!entries) return { folders: 0, files: 0, totalSize: 0 };
    return {
      folders: entries.filter((e) => e.isFolder).length,
      files: entries.filter((e) => !e.isFolder).length,
      totalSize: entries.reduce((sum, e) => sum + e.size, 0),
    };
  }, [entries]);

  // Auto-navigate into the sole subfolder when root has exactly one folder and no files
  useEffect(() => {
    if (currentPrefix !== "" || !entries) return;
    const folders = entries.filter((e) => e.isFolder);
    const files = entries.filter((e) => !e.isFolder);
    if (folders.length === 1 && files.length === 0) {
      setCurrentPrefix(folders[0].key);
    }
  }, [currentPrefix, entries]);

  // --- Navigation ---
  const handleFolderClick = useCallback((folderKey: string) => {
    setPreviewFile(null);
    setSelectedKeys(new Set());
    setSearchQuery("");
    setCurrentPrefix(folderKey);
  }, []);

  const handleFileClick = useCallback((fileKey: string) => {
    setPreviewFile(fileKey);
  }, []);

  const handleNavigate = useCallback((prefix: string) => {
    setPreviewFile(null);
    setSelectedKeys(new Set());
    setSearchQuery("");
    setCurrentPrefix(prefix);
  }, []);

  const handleGoUp = useCallback(() => {
    setPreviewFile(null);
    setSelectedKeys(new Set());
    if (!currentPrefix) return;
    const parts = currentPrefix.replace(/\/$/, "").split("/");
    parts.pop();
    setCurrentPrefix(parts.length > 0 ? parts.join("/") + "/" : "");
  }, [currentPrefix]);

  // --- Selection ---
  const handleSelect = useCallback((key: string, checked: boolean) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (checked) next.add(key);
      else next.delete(key);
      return next;
    });
  }, []);

  const handleSelectAll = useCallback((checked: boolean) => {
    if (checked) {
      setSelectedKeys(new Set(sortedEntries.map((e) => e.key)));
    } else {
      setSelectedKeys(new Set());
    }
  }, [sortedEntries]);

  // --- Downloads ---
  const handleDownloadZip = useCallback(
    (prefix: string) => {
      const url = filesApi.getDownloadZipUrl(companyId, prefix);
      window.open(url, "_blank");
    },
    [companyId],
  );

  const handleDownloadFile = useCallback(
    (key: string) => {
      const url = filesApi.getContentUrl(companyId, key);
      const a = document.createElement("a");
      a.href = url;
      a.download = getFileName(key);
      a.click();
    },
    [companyId],
  );

  // --- Context actions ---
  const handleContextAction = useCallback(
    (entry: FileEntry, action: string) => {
      switch (action) {
        case "download":
          if (entry.isFolder) handleDownloadZip(entry.key);
          else handleDownloadFile(entry.key);
          break;
        case "copyLink": {
          const url = window.location.origin + filesApi.getContentUrl(companyId, entry.key);
          navigator.clipboard.writeText(url);
          break;
        }
        case "openNew": {
          const url = filesApi.getContentUrl(companyId, entry.key);
          window.open(url, "_blank");
          break;
        }
        case "delete":
          handleDeleteFile(entry.key);
          break;
      }
    },
    [companyId, handleDownloadZip, handleDownloadFile],
  );

  // --- Delete ---
  const handleDeleteFile = useCallback(
    async (key: string) => {
      try {
        await filesApi.delete(companyId, key);
        queryClient.invalidateQueries({ queryKey: queryKeys.files(companyId, currentPrefix) });
        if (previewFile === key) setPreviewFile(null);
        setSelectedKeys((prev) => {
          const next = new Set(prev);
          next.delete(key);
          return next;
        });
      } catch {
        // TODO: toast error
      }
    },
    [companyId, currentPrefix, previewFile, queryClient],
  );

  // --- Upload ---
  const processUploads = useCallback(
    async (files: FileList | File[]) => {
      const fileArray = Array.from(files);
      const newUploads: UploadItem[] = fileArray.map((f, i) => ({
        id: `${Date.now()}-${i}`,
        file: f,
        status: "pending" as const,
        progress: 0,
      }));

      setUploads((prev) => [...prev, ...newUploads]);

      for (const upload of newUploads) {
        setUploads((prev) =>
          prev.map((u) => (u.id === upload.id ? { ...u, status: "uploading" as const } : u))
        );
        try {
          const targetPath = currentPrefix
            ? `${currentPrefix}${upload.file.name}`
            : `workspace/${upload.file.name}`;
          await filesApi.upload(companyId, targetPath, upload.file);
          setUploads((prev) =>
            prev.map((u) => (u.id === upload.id ? { ...u, status: "done" as const, progress: 100 } : u))
          );
        } catch (err) {
          setUploads((prev) =>
            prev.map((u) =>
              u.id === upload.id
                ? { ...u, status: "error" as const, error: err instanceof Error ? err.message : "Upload failed" }
                : u
            )
          );
        }
      }

      // Refresh file list
      queryClient.invalidateQueries({ queryKey: queryKeys.files(companyId, currentPrefix) });
    },
    [companyId, currentPrefix, queryClient],
  );

  const handleFileInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files.length > 0) {
        processUploads(e.target.files);
        e.target.value = "";
      }
    },
    [processUploads],
  );

  const triggerUpload = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  // --- Drag & Drop ---
  const handleDragEnter = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCountRef.current++;
    if (e.dataTransfer.types.includes("Files")) {
      setIsDragOver(true);
    }
  }, []);

  const handleDragLeave = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCountRef.current--;
    if (dragCountRef.current === 0) {
      setIsDragOver(false);
    }
  }, []);

  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dragCountRef.current = 0;
      setIsDragOver(false);

      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        processUploads(e.dataTransfer.files);
      }
    },
    [processUploads],
  );

  // --- Bulk actions ---
  const handleBulkDelete = useCallback(async () => {
    const keys = Array.from(selectedKeys);
    for (const key of keys) {
      try {
        await filesApi.delete(companyId, key);
      } catch {
        // continue
      }
    }
    setSelectedKeys(new Set());
    queryClient.invalidateQueries({ queryKey: queryKeys.files(companyId, currentPrefix) });
  }, [companyId, currentPrefix, selectedKeys, queryClient]);

  const handleBulkDownload = useCallback(() => {
    // Download each selected file individually
    for (const key of selectedKeys) {
      const entry = sortedEntries.find((e) => e.key === key);
      if (entry?.isFolder) {
        handleDownloadZip(key);
      } else {
        handleDownloadFile(key);
      }
    }
  }, [selectedKeys, sortedEntries, handleDownloadZip, handleDownloadFile]);

  // --- Derived state ---
  const isEmpty = !isLoading && !error && sortedEntries.length === 0 && !searchQuery;
  const isSearchEmpty = !isLoading && !error && sortedEntries.length === 0 && !!searchQuery;
  const allSelected = sortedEntries.length > 0 && selectedKeys.size === sortedEntries.length;

  return (
    <div
      className="relative"
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={handleFileInputChange}
      />

      {/* Drag overlay */}
      {isDragOver && <DropZoneOverlay />}

      {/* Unified card */}
      <div className="border border-border rounded-lg bg-card overflow-hidden">
        {/* ── Card header: breadcrumb + actions ── */}
        <div className="px-3 py-2.5 border-b border-border bg-muted/20">
          {/* Top row: breadcrumb + toolbar */}
          <div className="flex items-center gap-2">
            <BreadcrumbNav prefix={currentPrefix} onNavigate={handleNavigate} />
            <div className="flex-1" />

            {/* Search */}
            <div className="relative w-44">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Search files..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-7 pl-8 text-xs"
              />
              {searchQuery && (
                <button
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  onClick={() => setSearchQuery("")}
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>

            {/* View toggle */}
            <div className="flex items-center border border-border rounded-md overflow-hidden">
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => setViewMode("list")}
                    className={cn(
                      "p-1.5 transition-colors",
                      viewMode === "list" ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
                    )}
                  >
                    <LayoutList className="h-3.5 w-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>List view</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => setViewMode("grid")}
                    className={cn(
                      "p-1.5 transition-colors",
                      viewMode === "grid" ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
                    )}
                  >
                    <LayoutGrid className="h-3.5 w-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>Grid view</TooltipContent>
              </Tooltip>
            </div>

            {/* Upload */}
            <Button size="xs" variant="outline" onClick={triggerUpload}>
              <Upload className="h-3.5 w-3.5" />
              Upload
            </Button>

            {/* Download zip */}
            {stats.files > 0 && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button size="icon-xs" variant="ghost" onClick={() => handleDownloadZip(currentPrefix)}>
                    <Download className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Download all as zip</TooltipContent>
              </Tooltip>
            )}
          </div>

          {/* Stats row */}
          {!isEmpty && !isLoading && (
            <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
              {stats.folders > 0 && (
                <span>{stats.folders} folder{stats.folders !== 1 ? "s" : ""}</span>
              )}
              {stats.files > 0 && (
                <span>{stats.files} file{stats.files !== 1 ? "s" : ""}</span>
              )}
              {stats.totalSize > 0 && (
                <span className="text-muted-foreground/60">{formatSize(stats.totalSize)}</span>
              )}
            </div>
          )}
        </div>

        {/* ── Content area ── */}

        {/* Loading */}
        {isLoading && (
          <>
            {/* Skeleton column header */}
            <div className="flex items-center px-3 py-1.5 border-b border-border bg-muted/10">
              <Skeleton className="h-4 w-4 rounded shrink-0" />
              <Skeleton className="h-3 w-10 ml-5" />
              <div className="flex-1" />
              <Skeleton className="h-3 w-8" />
              <Skeleton className="h-3 w-14 ml-8" />
              <span className="w-9" />
            </div>
            {/* Skeleton rows */}
            <div className="divide-y divide-border/50">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex items-center px-3 py-[7px]">
                  <Skeleton className="h-7 w-7 rounded-md shrink-0" />
                  <Skeleton className="h-4 ml-2.5" style={{ width: `${120 + (i % 3) * 40}px` }} />
                  <div className="flex-1" />
                  <Skeleton className="h-3 w-12" />
                  <Skeleton className="h-3 w-14 ml-6" />
                  <span className="w-9" />
                </div>
              ))}
            </div>
          </>
        )}

        {/* Error */}
        {error && (
          <div className="flex flex-col items-center py-12 px-6">
            <AlertCircle className="h-8 w-8 text-destructive/50 mb-3" />
            <p className="text-sm text-destructive font-medium">Failed to load files</p>
            <p className="text-xs text-muted-foreground mt-1">
              {error instanceof Error ? error.message : "Unknown error"}
            </p>
          </div>
        )}

        {/* Empty state */}
        {isEmpty && <EmptyWorkspace onUpload={triggerUpload} />}

        {/* Search empty */}
        {isSearchEmpty && (
          <div className="flex flex-col items-center py-12 px-6">
            <Search className="h-8 w-8 text-muted-foreground/30 mb-3" />
            <p className="text-sm text-muted-foreground">No files matching "{searchQuery}"</p>
          </div>
        )}

        {/* List view */}
        {!isLoading && viewMode === "list" && sortedEntries.length > 0 && (
          <>
            {/* Column header / bulk actions */}
            <div className={cn(
              "flex items-center px-3 py-1.5 text-xs font-medium border-b border-border",
              selectedKeys.size > 0 ? "bg-primary/5 text-foreground" : "bg-muted/10 text-muted-foreground",
            )}>
              <div className="w-7 shrink-0 mr-2.5 flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
                <Checkbox
                  checked={allSelected}
                  onCheckedChange={handleSelectAll}
                />
              </div>
              {selectedKeys.size > 0 ? (
                <>
                  <span>{selectedKeys.size} selected</span>
                  <div className="flex-1" />
                  <div className="flex items-center gap-1">
                    <Button size="xs" variant="outline" onClick={handleBulkDownload}>
                      <Download className="h-3 w-3" />
                      Download
                    </Button>
                    <Button size="xs" variant="outline" className="text-destructive hover:text-destructive" onClick={handleBulkDelete}>
                      <Trash2 className="h-3 w-3" />
                      Delete
                    </Button>
                    <Button size="xs" variant="ghost" onClick={() => setSelectedKeys(new Set())}>
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <span className="flex-1">Name</span>
                  <span className="w-[90px] text-right">Size</span>
                  <span className="w-[120px] text-right">Modified</span>
                  <span className="w-9" />
                </>
              )}
            </div>
            {sortedEntries.map((entry) => (
              <FileListRow
                key={entry.key}
                entry={entry}
                companyId={companyId}
                isSelected={selectedKeys.has(entry.key)}
                onSelect={(checked) => handleSelect(entry.key, !!checked)}
                onClick={() =>
                  entry.isFolder
                    ? handleFolderClick(entry.key)
                    : handleFileClick(entry.key)
                }
                onContextAction={(action) => handleContextAction(entry, action)}
              />
            ))}
          </>
        )}

        {/* Grid view */}
        {!isLoading && viewMode === "grid" && sortedEntries.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 p-3">
            {sortedEntries.map((entry) =>
              entry.isFolder ? (
                <div
                  key={entry.key}
                  className="group relative border border-border rounded-lg bg-card hover:border-primary/30 hover:shadow-sm transition-all cursor-pointer"
                  onClick={() => handleFolderClick(entry.key)}
                >
                  <div className="h-24 flex items-center justify-center">
                    <div className="h-11 w-11 rounded-lg bg-blue-500/10 flex items-center justify-center">
                      <Folder className="h-5.5 w-5.5 text-blue-500" />
                    </div>
                  </div>
                  <div className="px-2.5 py-2 border-t border-border/50">
                    <p className="text-sm truncate">{getFileName(entry.key)}</p>
                  </div>
                </div>
              ) : (
                <FileGridCard
                  key={entry.key}
                  entry={entry}
                  companyId={companyId}
                  isSelected={selectedKeys.has(entry.key)}
                  onSelect={(checked) => handleSelect(entry.key, !!checked)}
                  onClick={() => handleFileClick(entry.key)}
                  onContextAction={(action) => handleContextAction(entry, action)}
                />
              )
            )}
          </div>
        )}
      </div>

      {/* Upload progress */}
      {uploads.length > 0 && (
        <div className="fixed bottom-4 right-4 w-80 z-50">
          <UploadProgress
            uploads={uploads}
            onDismiss={() => setUploads([])}
          />
        </div>
      )}

      {/* File preview panel (Sheet) */}
      {previewFile && (
        <FilePreviewPanel
          companyId={companyId}
          fileKey={previewFile}
          onClose={() => setPreviewFile(null)}
          onDownload={() => handleDownloadFile(previewFile)}
          onDelete={() => handleDeleteFile(previewFile)}
        />
      )}
    </div>
  );
}
