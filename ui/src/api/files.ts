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

  upload: async (companyId: string, filePath: string, file: File) => {
    const res = await fetch(`/api/companies/${companyId}/files/content/${filePath}`, {
      method: "PUT",
      headers: { "Content-Type": file.type || "application/octet-stream" },
      body: file,
      credentials: "include",
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: "Upload failed" }));
      throw new Error(err.message || `Upload failed: ${res.status}`);
    }
    return res.json();
  },

  delete: async (companyId: string, filePath: string) => {
    const res = await fetch(`/api/companies/${companyId}/files/content/${filePath}`, {
      method: "DELETE",
      credentials: "include",
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: "Delete failed" }));
      throw new Error(err.message || `Delete failed: ${res.status}`);
    }
  },
};
