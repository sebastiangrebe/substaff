import { useRef, useState, type ChangeEvent } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { AssetLink } from "@substaff/shared";
import { attachmentsApi, type AttachmentLinkType } from "../api/attachments";
import { queryKeys } from "../lib/queryKeys";
import { Button } from "@/components/ui/button";
import { FileText, Paperclip, Trash2 } from "lucide-react";

interface EntityAttachmentsProps {
  companyId: string;
  linkType: AttachmentLinkType;
  linkId: string;
}

export function EntityAttachments({ companyId, linkType, linkId }: EntityAttachmentsProps) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);

  const { data: attachments } = useQuery({
    queryKey: queryKeys.attachments(linkType, linkId),
    queryFn: () => attachmentsApi.list(companyId, linkType, linkId),
    enabled: !!companyId && !!linkId,
  });

  const uploadAttachment = useMutation({
    mutationFn: async (file: File) => {
      return attachmentsApi.upload(companyId, linkType, linkId, file);
    },
    onSuccess: () => {
      setAttachmentError(null);
      queryClient.invalidateQueries({ queryKey: queryKeys.attachments(linkType, linkId) });
    },
    onError: (err) => {
      setAttachmentError(err instanceof Error ? err.message : "Upload failed");
    },
  });

  const deleteAttachment = useMutation({
    mutationFn: (id: string) => attachmentsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.attachments(linkType, linkId) });
    },
  });

  const handleFilePicked = async (evt: ChangeEvent<HTMLInputElement>) => {
    const file = evt.target.files?.[0];
    if (!file) return;
    await uploadAttachment.mutateAsync(file);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const isImage = (attachment: AssetLink) => attachment.contentType.startsWith("image/");

  if (attachments && attachments.length > 0) {
    return (
      <div className="rounded-xl border border-border/60 bg-card shadow-xs overflow-hidden mb-6">
        <div className="flex items-center justify-between px-5 py-3 border-b border-border/40">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Attachments</h3>
          <div className="flex items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              onChange={handleFilePicked}
            />
            <Button
              variant="ghost"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadAttachment.isPending}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              <Paperclip className="h-3 w-3 mr-1" />
              {uploadAttachment.isPending ? "Uploading..." : "Add"}
            </Button>
          </div>
        </div>

        {attachmentError && (
          <p className="text-xs text-destructive px-5 py-2">{attachmentError}</p>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-px bg-border/30">
          {attachments.map((attachment) => (
            <div key={attachment.id} className="group bg-card relative">
              {isImage(attachment) ? (
                <a href={attachment.contentPath} target="_blank" rel="noreferrer" className="block">
                  <img
                    src={attachment.contentPath}
                    alt={attachment.originalFilename ?? "attachment"}
                    className="w-full h-32 object-cover"
                    loading="lazy"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                </a>
              ) : (
                <a href={attachment.contentPath} target="_blank" rel="noreferrer" className="block">
                  <div className="w-full h-32 flex flex-col items-center justify-center bg-muted/20 gap-1">
                    <FileText className="h-6 w-6 text-muted-foreground/40" />
                    <span className="text-[10px] text-muted-foreground/50 uppercase tracking-wide">
                      {attachment.originalFilename?.split(".").pop() ?? "file"}
                    </span>
                  </div>
                </a>
              )}
              <div className="absolute bottom-0 left-0 right-0 px-2.5 py-1.5 flex items-center justify-between gap-1 bg-gradient-to-t from-black/60 to-transparent">
                <span className="text-[10px] text-white/80 truncate font-medium">
                  {attachment.originalFilename ?? attachment.id}
                </span>
                <button
                  type="button"
                  className="text-white/40 hover:text-red-300 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                  onClick={() => deleteAttachment.mutate(attachment.id)}
                  disabled={deleteAttachment.isPending}
                  title="Delete"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center mb-4">
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        onChange={handleFilePicked}
      />
      <Button
        variant="ghost"
        size="sm"
        onClick={() => fileInputRef.current?.click()}
        disabled={uploadAttachment.isPending}
        className="text-xs text-muted-foreground/50 hover:text-foreground"
      >
        <Paperclip className="h-3 w-3 mr-1.5" />
        {uploadAttachment.isPending ? "Uploading..." : "Attach file"}
      </Button>
      {attachmentError && (
        <p className="text-xs text-destructive ml-2">{attachmentError}</p>
      )}
    </div>
  );
}
