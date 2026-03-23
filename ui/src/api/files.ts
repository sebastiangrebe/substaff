import { createFilesApi } from "@substaff/app-core/api/files";
import { api } from "./client";

export type { FileEntry } from "@substaff/app-core/api/files";

// Note: The files API in app-core only includes platform-agnostic methods.
// upload() and delete() use web-specific fetch with credentials, so they stay here.
const coreFilesApi = createFilesApi(api);

export const filesApi = {
  ...coreFilesApi,

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
