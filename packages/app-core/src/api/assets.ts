import type { AssetImage } from "@substaff/shared";
import { type ApiClient } from "./client";

export function createAssetsApi(api: ApiClient) {
  return {
    uploadImage: async (companyId: string, file: File, namespace?: string) => {
      const buffer = await file.arrayBuffer();
      const safeFile = new File([buffer], file.name, { type: file.type });

      const form = new FormData();
      form.append("file", safeFile);
      if (namespace && namespace.trim().length > 0) {
        form.append("namespace", namespace.trim());
      }
      return api.postForm<AssetImage>(`/companies/${companyId}/assets/images`, form);
    },
  };
}
