import { createAttachmentsApi } from "@substaff/app-core/api/attachments";
import { api } from "./client";

export type { AttachmentLinkType } from "@substaff/app-core/api/attachments";

export const attachmentsApi = createAttachmentsApi(api);
