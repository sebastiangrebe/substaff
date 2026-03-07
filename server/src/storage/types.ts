import type { StorageProvider as StorageProviderId } from "@substaff/shared";
import type { Readable } from "node:stream";

export interface PutObjectInput {
  objectKey: string;
  body: Buffer;
  contentType: string;
  contentLength: number;
}

export interface GetObjectInput {
  objectKey: string;
}

export interface GetObjectResult {
  stream: Readable;
  contentType?: string;
  contentLength?: number;
  etag?: string;
  lastModified?: Date;
}

export interface HeadObjectResult {
  exists: boolean;
  contentType?: string;
  contentLength?: number;
  etag?: string;
  lastModified?: Date;
}

export interface ListObjectsInput {
  prefix: string;
  delimiter?: string;
}

export interface ListObjectEntry {
  key: string;
  size: number;
  lastModified: Date | null;
}

export interface ListObjectsResult {
  objects: ListObjectEntry[];
  commonPrefixes: string[];
}

export interface StorageProvider {
  id: StorageProviderId;
  putObject(input: PutObjectInput): Promise<void>;
  getObject(input: GetObjectInput): Promise<GetObjectResult>;
  headObject(input: GetObjectInput): Promise<HeadObjectResult>;
  deleteObject(input: GetObjectInput): Promise<void>;
  listObjects(input: ListObjectsInput): Promise<ListObjectsResult>;
}

export interface PutFileInput {
  companyId: string;
  namespace: string;
  originalFilename: string | null;
  contentType: string;
  body: Buffer;
}

export interface PutFileResult {
  provider: StorageProviderId;
  objectKey: string;
  contentType: string;
  byteSize: number;
  sha256: string;
  originalFilename: string | null;
}

export interface StorageService {
  provider: StorageProviderId;
  putFile(input: PutFileInput): Promise<PutFileResult>;
  getObject(companyId: string, objectKey: string): Promise<GetObjectResult>;
  headObject(companyId: string, objectKey: string): Promise<HeadObjectResult>;
  deleteObject(companyId: string, objectKey: string): Promise<void>;
  listObjects(companyId: string, prefix: string): Promise<ListObjectsResult>;
}
