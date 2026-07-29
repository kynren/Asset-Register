import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { axiosClient } from "../../api/axiosClient";
import { Icon } from "../../components/Icon";
import { ConfirmDialog } from "../../components/ConfirmDialog";

interface UserImage {
  id: number;
  url: string;
  createdAt: string;
}

export function AvatarGallery({ currentAvatarUrl, onSelect }: { currentAvatarUrl: string | null; onSelect: (url: string) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [deleting, setDeleting] = useState<UserImage | null>(null);
  const queryClient = useQueryClient();

  const { data: images } = useQuery({
    queryKey: ["profile-images"],
    queryFn: async () => (await axiosClient.get("/profile/images")).data as UserImage[],
  });

  const uploadMutation = useMutation({
    mutationFn: (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      return axiosClient.post("/profile/images", formData, { headers: { "Content-Type": "multipart/form-data" } });
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["profile-images"] });
      onSelect(res.data.url);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => axiosClient.delete(`/profile/images/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["profile-images"] }); setDeleting(null); },
  });

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) uploadMutation.mutate(file);
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <div>
      <div className="row gap-2 flex-wrap" style={{ marginBottom: 10 }}>
        {images?.map((img) => (
          <div
            key={img.id}
            onClick={() => onSelect(img.url)}
            style={{
              position: "relative",
              width: 56,
              height: 56,
              borderRadius: 10,
              overflow: "hidden",
              cursor: "pointer",
              border: currentAvatarUrl === img.url ? "2px solid var(--color-primary)" : "2px solid transparent",
            }}
          >
            <img src={img.url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            <button
              onClick={(e) => { e.stopPropagation(); setDeleting(img); }}
              style={{ position: "absolute", top: 2, right: 2, background: "rgba(0,0,0,0.6)", border: "none", borderRadius: 4, color: "#fff", cursor: "pointer", padding: 2 }}
            >
              <Icon name="close" size={10} />
            </button>
          </div>
        ))}
        <button
          className="btn btn-secondary"
          style={{ width: 56, height: 56, borderRadius: 10, flexDirection: "column", gap: 2 }}
          onClick={() => inputRef.current?.click()}
          disabled={uploadMutation.isPending}
        >
          <Icon name="plus" size={16} />
        </button>
        <input ref={inputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleChange} />
      </div>
      <p className="muted" style={{ fontSize: 11 }}>Upload photos and click one to set it as your profile picture.</p>

      {deleting && (
        <ConfirmDialog
          title="Delete photo"
          message="Are you sure you want to delete this photo? This cannot be undone."
          danger
          loading={deleteMutation.isPending}
          onCancel={() => setDeleting(null)}
          onConfirm={() => deleteMutation.mutate(deleting.id)}
        />
      )}
    </div>
  );
}
