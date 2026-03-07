import { api } from "./client";

export interface FileEntry {
  key: string;
  size: number;
  lastModified: string | null;
  isFolder: boolean;
}

export const filesApi = {
  list: (companyId: string, prefix: string = "") =>
    api.get<FileEntry[]>(
      `/companies/${companyId}/files${prefix ? `?prefix=${encodeURIComponent(prefix)}` : ""}`,
    ),

  getContentUrl: (companyId: string, key: string) =>
    `/api/companies/${companyId}/files/content/${key}`,

  getDownloadZipUrl: (companyId: string, prefix: string) =>
    `/api/companies/${companyId}/files/download-zip${prefix ? `?prefix=${encodeURIComponent(prefix)}` : ""}`,
};
