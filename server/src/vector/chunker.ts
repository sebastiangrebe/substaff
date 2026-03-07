export interface ContentChunk {
  text: string;
  index: number;
  total: number;
  metadata: {
    language?: string;
    section?: string;
  };
}

const TARGET_CHUNK_CHARS = 3200; // ~800 tokens
const MAX_CHUNK_CHARS = 8000; // ~2000 tokens
const OVERLAP_CHARS = 800; // ~200 tokens

const CODE_EXTENSIONS = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".py", ".go", ".rs", ".java",
  ".c", ".cpp", ".h", ".hpp", ".cs", ".rb", ".php", ".swift",
  ".kt", ".scala", ".sh", ".bash", ".zsh",
]);

const CONFIG_EXTENSIONS = new Set([
  ".json", ".yaml", ".yml", ".toml", ".ini", ".env", ".xml",
]);

const MARKDOWN_EXTENSIONS = new Set([".md", ".mdx", ".rst"]);

const SKIP_EXTENSIONS = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".svg", ".ico", ".webp",
  ".woff", ".woff2", ".ttf", ".eot",
  ".zip", ".tar", ".gz", ".bz2",
  ".lock", ".map",
]);

const SKIP_PATHS = [
  "node_modules/",
  "dist/",
  ".git/",
  ".next/",
  "__pycache__/",
  "vendor/",
  ".turbo/",
  "coverage/",
];

const MAX_FILE_SIZE = 100_000; // 100KB

export function shouldIndex(filePath: string, size: number): boolean {
  if (size > MAX_FILE_SIZE) return false;
  if (size === 0) return false;

  const lower = filePath.toLowerCase();
  if (SKIP_PATHS.some((p) => lower.includes(p))) return false;

  const ext = getExtension(lower);
  if (SKIP_EXTENSIONS.has(ext)) return false;

  return true;
}

export function getArtifactType(filePath: string): string {
  const ext = getExtension(filePath.toLowerCase());

  if (CODE_EXTENSIONS.has(ext)) return "code";
  if (MARKDOWN_EXTENSIONS.has(ext)) return "markdown";
  if (CONFIG_EXTENSIONS.has(ext)) return "config";
  if (filePath.includes("openapi") || filePath.includes("swagger")) return "api_contract";

  return "code"; // default to code for unknown text files
}

export function getLanguage(filePath: string): string | undefined {
  const ext = getExtension(filePath.toLowerCase());
  const map: Record<string, string> = {
    ".ts": "typescript", ".tsx": "typescript",
    ".js": "javascript", ".jsx": "javascript",
    ".py": "python", ".go": "go", ".rs": "rust",
    ".java": "java", ".rb": "ruby", ".php": "php",
    ".c": "c", ".cpp": "cpp", ".cs": "csharp",
    ".swift": "swift", ".kt": "kotlin", ".scala": "scala",
    ".sh": "shell", ".bash": "shell", ".zsh": "shell",
    ".md": "markdown", ".mdx": "markdown",
    ".json": "json", ".yaml": "yaml", ".yml": "yaml",
    ".toml": "toml", ".xml": "xml",
  };
  return map[ext];
}

function getExtension(filePath: string): string {
  const dotIdx = filePath.lastIndexOf(".");
  return dotIdx >= 0 ? filePath.slice(dotIdx) : "";
}

export function chunkContent(content: string, filePath: string): ContentChunk[] {
  const artifactType = getArtifactType(filePath);

  if (content.length <= MAX_CHUNK_CHARS) {
    return [{
      text: content,
      index: 0,
      total: 1,
      metadata: { language: getLanguage(filePath) },
    }];
  }

  let rawChunks: string[];

  switch (artifactType) {
    case "markdown":
      rawChunks = chunkByHeadings(content);
      break;
    case "code":
      rawChunks = chunkByCodeBoundaries(content);
      break;
    default:
      rawChunks = chunkBySlidingWindow(content);
      break;
  }

  // Subdivide any oversized chunks
  const finalChunks: string[] = [];
  for (const chunk of rawChunks) {
    if (chunk.length > MAX_CHUNK_CHARS) {
      finalChunks.push(...chunkBySlidingWindow(chunk));
    } else {
      finalChunks.push(chunk);
    }
  }

  const language = getLanguage(filePath);
  return finalChunks.map((text, i) => ({
    text,
    index: i,
    total: finalChunks.length,
    metadata: { language },
  }));
}

function chunkByHeadings(content: string): string[] {
  const sections = content.split(/^(?=#{1,3} )/m);
  return mergeSmallChunks(sections);
}

function chunkByCodeBoundaries(content: string): string[] {
  // Split on function/class/export boundaries
  const boundaries = content.split(
    /\n(?=(?:export\s+)?(?:(?:async\s+)?function|class|const\s+\w+\s*=|interface\s|type\s+\w+\s*=|enum\s)\s)/,
  );
  return mergeSmallChunks(boundaries);
}

function chunkBySlidingWindow(content: string): string[] {
  const chunks: string[] = [];
  let start = 0;

  while (start < content.length) {
    const end = Math.min(start + TARGET_CHUNK_CHARS, content.length);
    chunks.push(content.slice(start, end));
    start = end - OVERLAP_CHARS;
    if (start + OVERLAP_CHARS >= content.length) break;
  }

  return chunks;
}

/** Merge chunks that are too small into their neighbors */
function mergeSmallChunks(chunks: string[]): string[] {
  const minSize = TARGET_CHUNK_CHARS / 4;
  const merged: string[] = [];

  let buffer = "";
  for (const chunk of chunks) {
    const trimmed = chunk.trim();
    if (!trimmed) continue;

    if (buffer.length + trimmed.length < TARGET_CHUNK_CHARS) {
      buffer += (buffer ? "\n" : "") + trimmed;
    } else {
      if (buffer) merged.push(buffer);
      buffer = trimmed;
    }
  }
  if (buffer) merged.push(buffer);

  // Handle case where merging produced chunks that are too small
  if (merged.length > 1 && merged[merged.length - 1].length < minSize) {
    const last = merged.pop()!;
    merged[merged.length - 1] += "\n" + last;
  }

  return merged;
}
