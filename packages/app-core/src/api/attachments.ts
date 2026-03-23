import type { AssetLink } from "@substaff/shared";
import { type ApiClient } from "./client";

export type AttachmentLinkType = "issue" | "project" | "goal";

export function createAttachmentsApi(api: ApiClient) {
  return {
    list: (companyId: string, linkType: AttachmentLinkType, linkId: string) =>
      api.get<AssetLink[]>(`/companies/${companyId}/attachments/${linkType}/${linkId}`),

    upload: (companyId: string, linkType: AttachmentLinkType, linkId: string, file: File) => {
      const form = new FormData();
      form.append("file", file);
      return api.postForm<AssetLink>(`/companies/${companyId}/attachments/${linkType}/${linkId}`, form);
    },

    delete: (id: string) => api.delete<{ ok: true }>(`/attachments/${id}`),
  };
}
