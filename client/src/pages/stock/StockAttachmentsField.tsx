import { useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { axiosClient } from "../../api/axiosClient";
import { Icon } from "../../components/Icon";
import { FilePreview } from "../../components/FilePreview";

interface StockItemAttachment {
  id: number;
  url: string;
  mimeType: string | null;
  originalName: string | null;
}

// Only rendered once a stock item exists (create flow uploads immediately after Save creates the
// item, same two-step pattern AssetPhoto upload uses elsewhere) — there's no "pending attachment"
// concept, so this field only appears in edit/detail contexts, never on the blank Add form.
export function StockAttachmentsField({ stockItemId }: { stockItemId: number }) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { data: attachments } = useQuery<StockItemAttachment[]>({
    queryKey: ["stock-attachments", stockItemId],
    queryFn: async () => (await axiosClient.get(`/stock/${stockItemId}`)).data.attachments,
  });

  const uploadMutation = useMutation({
    mutationFn: (file: File) => {
      const form = new FormData();
      form.append("file", file);
      return axiosClient.post(`/stock/${stockItemId}/attachments`, form, { headers: { "Content-Type": "multipart/form-data" } });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["stock-attachments", stockItemId] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (attachmentId: number) => axiosClient.delete(`/stock/${stockItemId}/attachments/${attachmentId}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["stock-attachments", stockItemId] }),
  });

  return (
    <div className="field">
      <div className="field-label-row">
        <label>Images / Video</label>
        <button type="button" className="field-add-btn" title="Add attachment" disabled={uploadMutation.isPending} onClick={() => fileInputRef.current?.click()}>
          <Icon name="plus" size={12} />
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,video/*"
          style={{ display: "none" }}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) uploadMutation.mutate(file);
            if (fileInputRef.current) fileInputRef.current.value = "";
          }}
        />
      </div>
      {(attachments?.length ?? 0) === 0 && <div className="muted" style={{ fontSize: 12 }}>No images or video attached yet.</div>}
      {attachments && attachments.length > 0 && (
        <div className="grid grid-cols-3" style={{ gap: 8 }}>
          {attachments.map((a) => (
            <div key={a.id} className="card" style={{ padding: 6, position: "relative" }}>
              <FilePreview src={a.url} nameForKind={a.originalName ?? a.url} mimeType={a.mimeType} maxHeight={100} />
              <button
                type="button"
                className="btn btn-danger btn-sm btn-icon"
                style={{ position: "absolute", top: 4, right: 4 }}
                title="Remove"
                disabled={deleteMutation.isPending}
                onClick={() => deleteMutation.mutate(a.id)}
              >
                <Icon name="trash" size={11} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
