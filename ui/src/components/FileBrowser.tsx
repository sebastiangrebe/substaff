import { useState, useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ChevronRight,
  ChevronDown,
  Folder,
  File,
  FileCode,
  FileText,
  FileImage,
  FileJson,
  FileArchive,
  ArrowLeft,
} from "lucide-react";
import { filesApi, type FileEntry } from "../api/files";
import { queryKeys } from "../lib/queryKeys";
import { Button } from "@/components/ui/button";

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

function getFileIcon(entry: FileEntry) {
  if (entry.isFolder) return Folder;
  const ext = getExtension(entry.key);
  if (CODE_EXTENSIONS.has(ext)) return FileCode;
  if (IMAGE_EXTENSIONS.has(ext)) return FileImage;
  if (ARCHIVE_EXTENSIONS.has(ext)) return FileArchive;
  if (ext === "json") return FileJson;
  if (ext === "md" || ext === "txt" || ext === "log" || ext === "csv") return FileText;
  return File;
}

function formatSize(bytes: number): string {
  if (bytes === 0) return "-";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "-";
  const d = new Date(dateStr);
  return d.toLocaleDateString(undefined, {
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
    <div className="flex items-center gap-1 text-sm text-muted-foreground mb-3 flex-wrap">
      <button
        onClick={() => onNavigate("")}
        className="hover:text-foreground transition-colors font-medium"
      >
        Root
      </button>
      {crumbs.map((crumb) => (
        <span key={crumb.prefix} className="flex items-center gap-1">
          <ChevronRight className="h-3 w-3" />
          <button
            onClick={() => onNavigate(crumb.prefix)}
            className="hover:text-foreground transition-colors"
          >
            {crumb.label}
          </button>
        </span>
      ))}
    </div>
  );
}

function FilePreview({
  companyId,
  fileKey,
  onClose,
}: {
  companyId: string;
  fileKey: string;
  onClose: () => void;
}) {
  const ext = getExtension(fileKey);
  const isImage = IMAGE_EXTENSIONS.has(ext);
  const isText = isPreviewableText(ext);
  const contentUrl = filesApi.getContentUrl(companyId, fileKey);

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
    <div className="border border-border rounded-md bg-card overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-muted/30">
        <div className="flex items-center gap-2 min-w-0">
          <Button variant="ghost" size="icon-sm" onClick={onClose}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm font-medium truncate">{getFileName(fileKey)}</span>
        </div>
        <a
          href={contentUrl}
          download={getFileName(fileKey)}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          Download
        </a>
      </div>
      <div className="p-4 max-h-[600px] overflow-auto">
        {isImage && (
          <img
            src={contentUrl}
            alt={getFileName(fileKey)}
            className="max-w-full h-auto rounded"
          />
        )}
        {isText && isLoading && (
          <div className="text-sm text-muted-foreground">Loading...</div>
        )}
        {isText && !isLoading && textContent !== undefined && (
          <pre className="text-xs leading-relaxed font-mono whitespace-pre-wrap break-words text-foreground bg-muted/20 p-3 rounded-md overflow-x-auto">
            {textContent}
          </pre>
        )}
        {!isImage && !isText && (
          <div className="text-sm text-muted-foreground text-center py-8">
            Preview not available for .{ext} files.{" "}
            <a
              href={contentUrl}
              download={getFileName(fileKey)}
              className="text-primary hover:underline"
            >
              Download instead
            </a>
          </div>
        )}
      </div>
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
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());

  const { data: entries, isLoading, error } = useQuery({
    queryKey: queryKeys.files(companyId, currentPrefix),
    queryFn: () => filesApi.list(companyId, currentPrefix),
    enabled: !!companyId,
  });

  const sortedEntries = useMemo(() => {
    if (!entries) return [];
    return [...entries].sort((a, b) => {
      // Folders first
      if (a.isFolder && !b.isFolder) return -1;
      if (!a.isFolder && b.isFolder) return 1;
      return getFileName(a.key).localeCompare(getFileName(b.key));
    });
  }, [entries]);

  const handleFolderClick = useCallback((folderKey: string) => {
    setSelectedFile(null);
    setCurrentPrefix(folderKey);
  }, []);

  const handleFileClick = useCallback((fileKey: string) => {
    setSelectedFile(fileKey);
  }, []);

  const handleNavigate = useCallback((prefix: string) => {
    setSelectedFile(null);
    setCurrentPrefix(prefix);
  }, []);

  const handleGoUp = useCallback(() => {
    setSelectedFile(null);
    if (!currentPrefix) return;
    const parts = currentPrefix.replace(/\/$/, "").split("/");
    parts.pop();
    setCurrentPrefix(parts.length > 0 ? parts.join("/") + "/" : "");
  }, [currentPrefix]);

  if (selectedFile) {
    return (
      <FilePreview
        companyId={companyId}
        fileKey={selectedFile}
        onClose={() => setSelectedFile(null)}
      />
    );
  }

  return (
    <div className="space-y-2">
      <BreadcrumbNav prefix={currentPrefix} onNavigate={handleNavigate} />

      <div className="border border-border rounded-md bg-card overflow-hidden">
        {/* Header */}
        <div className="grid grid-cols-[1fr_100px_160px] gap-2 px-4 py-2 text-xs font-medium text-muted-foreground border-b border-border bg-muted/30">
          <span>Name</span>
          <span className="text-right">Size</span>
          <span className="text-right">Modified</span>
        </div>

        {/* Loading */}
        {isLoading && (
          <div className="px-4 py-8 text-sm text-muted-foreground text-center">
            Loading files...
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="px-4 py-8 text-sm text-destructive text-center">
            {error instanceof Error ? error.message : "Failed to load files"}
          </div>
        )}

        {/* Go up row */}
        {!isLoading && currentPrefix && (
          <button
            onClick={handleGoUp}
            className="w-full grid grid-cols-[1fr_100px_160px] gap-2 px-4 py-2 text-sm hover:bg-accent/50 transition-colors text-left"
          >
            <span className="flex items-center gap-2 text-muted-foreground">
              <ArrowLeft className="h-4 w-4 shrink-0" />
              <span>..</span>
            </span>
            <span />
            <span />
          </button>
        )}

        {/* Empty state */}
        {!isLoading && !error && sortedEntries.length === 0 && (
          <div className="px-4 py-8 text-sm text-muted-foreground text-center">
            No files in this directory.
          </div>
        )}

        {/* File list */}
        {!isLoading &&
          sortedEntries.map((entry) => {
            const Icon = getFileIcon(entry);
            const name = getFileName(entry.key);
            const isFolder = entry.isFolder;

            return (
              <button
                key={entry.key}
                onClick={() =>
                  isFolder
                    ? handleFolderClick(entry.key)
                    : handleFileClick(entry.key)
                }
                className="w-full grid grid-cols-[1fr_100px_160px] gap-2 px-4 py-2 text-sm hover:bg-accent/50 transition-colors text-left border-t border-border first:border-t-0"
              >
                <span className="flex items-center gap-2 min-w-0">
                  {isFolder ? (
                    <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  ) : (
                    <span className="w-3.5 shrink-0" />
                  )}
                  <Icon
                    className={`h-4 w-4 shrink-0 ${
                      isFolder ? "text-blue-500" : "text-muted-foreground"
                    }`}
                  />
                  <span className="truncate">{name}</span>
                </span>
                <span className="text-right text-muted-foreground tabular-nums">
                  {formatSize(entry.size)}
                </span>
                <span className="text-right text-muted-foreground">
                  {formatDate(entry.lastModified)}
                </span>
              </button>
            );
          })}
      </div>
    </div>
  );
}
