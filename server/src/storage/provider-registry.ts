import type { Config } from "../config.js";
import type { StorageProvider } from "./types.js";
import { createS3StorageProvider } from "./s3-provider.js";

export function createStorageProviderFromConfig(config: Config): StorageProvider {
  return createS3StorageProvider({
    bucket: config.storageS3Bucket,
    region: config.storageS3Region,
    endpoint: config.storageS3Endpoint,
    prefix: config.storageS3Prefix,
    forcePathStyle: config.storageS3ForcePathStyle,
  });
}
