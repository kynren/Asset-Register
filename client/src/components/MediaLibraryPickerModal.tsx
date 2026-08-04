import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { axiosClient } from "../api/axiosClient";
import { FormModal } from "./FormModal";
import { Icon } from "./Icon";

export interface PickedMediaAsset {
  url: string;
  originalName: string;
  altText: string | null;
  title: string | null;
  type: "IMAGE" | "VIDEO" | "AUDIO" | "DOCUMENT" | "OTHER";
}

const TYPE_ICON: Record<string, string> = { IMAGE: "image", VIDEO: "video", AUDIO: "music", DOCUMENT: "fileText", OTHER: "file" };

// Picker-mode view onto the same Media Library the App Settings → Media Center tab manages —
// lets any RichTextEditor consumer (Docs, Email Templates, Ticket bodies, Knowledge Base) reuse
// an already-uploaded file instead of re-uploading a fresh copy every time.
export function MediaLibraryPickerModal({ onPick, onClose }: { onPick: (asset: PickedMediaAsset) => void; onClose: () => void }) {
  const [search, setSearch] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["media-library-picker", search],
    queryFn: async () => (await axiosClient.get("/media-center/library", { params: { page: 1, pageSize: 60, search: search || undefined } })).data as { rows: PickedMediaAsset[] & any[] },
  });

  return (
    <FormModal title="Insert from Media Library" onClose={onClose} hideFooter maxWidth={720}>
      <div className="stack gap-3">
        <input className="input" placeholder="Search media..." value={search} onChange={(e) => setSearch(e.target.value)} />
        {isLoading && <div className="muted">Loading...</div>}
        {!isLoading && (data?.rows.length ?? 0) === 0 && <div className="empty-state">No media in the library yet — upload files from App Settings → Media Center.</div>}
        {!isLoading && data && data.rows.length > 0 && (
          <div className="grid grid-cols-4" style={{ gap: 10, maxHeight: 420, overflowY: "auto" }}>
            {data.rows.map((asset: any) => (
              <div key={asset.id} className="card" style={{ cursor: "pointer", padding: 6 }} onClick={() => onPick(asset)}>
                <div style={{ aspectRatio: "4/3", background: "var(--color-surface-inset, #0d1117)", borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", marginBottom: 4 }}>
                  {asset.type === "IMAGE" ? (
                    <img src={asset.url} alt={asset.altText ?? asset.originalName} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  ) : (
                    <Icon name={TYPE_ICON[asset.type] ?? "file"} size={22} />
                  )}
                </div>
                <div style={{ fontSize: 11, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={asset.originalName}>
                  {asset.title || asset.originalName}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </FormModal>
  );
}
