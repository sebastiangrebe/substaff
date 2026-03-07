import type { Readable } from "node:stream";

export interface StorageClient {
  upload(key: string, body: Buffer | Readable | string, contentType?: string): Promise<void>;
  download(key: string): Promise<Buffer>;
  list(prefix: string): Promise<StorageListEntry[]>;
  delete(key: string): Promise<void>;
  getSignedUrl(key: string, expiresInSeconds?: number): Promise<string>;
  exists(key: string): Promise<boolean>;
}

export interface StorageListEntry {
  key: string;
  size: number;
  lastModified: Date | null;
}
