import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  DeleteObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl as awsGetSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { Readable } from "node:stream";
import type { StorageClient, StorageListEntry } from "./types.js";

export interface S3StorageConfig {
  bucket: string;
  region: string;
  endpoint?: string;
  prefix?: string;
  forcePathStyle?: boolean;
}

export function createS3StorageClient(config: S3StorageConfig): StorageClient {
  const client = new S3Client({
    region: config.region,
    endpoint: config.endpoint,
    forcePathStyle: config.forcePathStyle,
  });

  const prefix = config.prefix ? `${config.prefix}/` : "";

  function fullKey(key: string): string {
    return `${prefix}${key}`;
  }

  return {
    async upload(key: string, body: Buffer | Readable | string, contentType?: string): Promise<void> {
      await client.send(
        new PutObjectCommand({
          Bucket: config.bucket,
          Key: fullKey(key),
          Body: body,
          ContentType: contentType,
        }),
      );
    },

    async download(key: string): Promise<Buffer> {
      const response = await client.send(
        new GetObjectCommand({
          Bucket: config.bucket,
          Key: fullKey(key),
        }),
      );
      const chunks: Uint8Array[] = [];
      const stream = response.Body as Readable;
      for await (const chunk of stream) {
        chunks.push(chunk as Uint8Array);
      }
      return Buffer.concat(chunks);
    },

    async list(listPrefix: string): Promise<StorageListEntry[]> {
      const entries: StorageListEntry[] = [];
      let continuationToken: string | undefined;

      do {
        const response = await client.send(
          new ListObjectsV2Command({
            Bucket: config.bucket,
            Prefix: fullKey(listPrefix),
            ContinuationToken: continuationToken,
          }),
        );

        for (const obj of response.Contents ?? []) {
          if (obj.Key) {
            entries.push({
              key: obj.Key.slice(prefix.length),
              size: obj.Size ?? 0,
              lastModified: obj.LastModified ?? null,
            });
          }
        }

        continuationToken = response.NextContinuationToken;
      } while (continuationToken);

      return entries;
    },

    async delete(key: string): Promise<void> {
      await client.send(
        new DeleteObjectCommand({
          Bucket: config.bucket,
          Key: fullKey(key),
        }),
      );
    },

    async getSignedUrl(key: string, expiresInSeconds = 3600): Promise<string> {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument -- AWS SDK version mismatch between client-s3 and s3-request-presigner
      return awsGetSignedUrl(
        client as any,
        new GetObjectCommand({
          Bucket: config.bucket,
          Key: fullKey(key),
        }) as any,
        { expiresIn: expiresInSeconds },
      );
    },

    async exists(key: string): Promise<boolean> {
      try {
        await client.send(
          new HeadObjectCommand({
            Bucket: config.bucket,
            Key: fullKey(key),
          }),
        );
        return true;
      } catch {
        return false;
      }
    },
  };
}
