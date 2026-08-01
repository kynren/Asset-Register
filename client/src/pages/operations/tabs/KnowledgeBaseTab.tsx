import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import dayjs from "dayjs";
import { axiosClient } from "../../../api/axiosClient";
import { Icon } from "../../../components/Icon";
import { FormModal } from "../../../components/FormModal";
import { PermissionGate } from "../../../auth/PermissionGate";
import { ConfirmDialog } from "../../../components/ConfirmDialog";
import { SkeletonText } from "../../../components/Skeleton";

interface Article {
  id: number;
  title: string;
  content: string;
  category: string | null;
  createdBy: { id: number; firstName: string; lastName: string };
  createdAt: string;
  updatedAt: string;
}

export function KnowledgeBaseTab() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [category, setCategory] = useState("");
  const [deleting, setDeleting] = useState<Article | null>(null);

  const { data: articles, isLoading } = useQuery({
    queryKey: ["op-knowledge", search],
    queryFn: async () => (await axiosClient.get("/operations/knowledge", { params: { search: search || undefined } })).data as Article[],
  });

  const createMutation = useMutation({
    mutationFn: () => axiosClient.post("/operations/knowledge", { title, content, category: category || undefined }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["op-knowledge"] });
      setShowForm(false);
      setTitle("");
      setContent("");
      setCategory("");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => axiosClient.delete(`/operations/knowledge/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["op-knowledge"] }); setDeleting(null); },
  });

  const duplicateMutation = useMutation({
    mutationFn: (id: number) => axiosClient.post(`/operations/knowledge/${id}/duplicate`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["op-knowledge"] }),
  });

  return (
    <div>
      <div className="ot-body-header">
        <input className="ad-input" style={{ maxWidth: 320 }} placeholder="Search knowledge base..." value={search} onChange={(e) => setSearch(e.target.value)} />
        <PermissionGate module="operations" action="create">
          <button className="ad-btn ad-btn-primary" onClick={() => setShowForm(true)}><Icon name="plus" size={13} /> New Article</button>
        </PermissionGate>
      </div>

      {isLoading ? (
        <div className="stack gap-2"><SkeletonText lines={4} /></div>
      ) : articles && articles.length > 0 ? (
        <div className="ot-list">
          {articles.map((a) => (
            <div key={a.id} className="ot-item">
              <div className="ot-item-top">
                <div>
                  <div className="ot-item-title" style={{ cursor: "pointer" }} onClick={() => setExpanded(expanded === a.id ? null : a.id)}>{a.title}</div>
                  <div className="ot-item-meta">
                    {a.category ? `${a.category} · ` : ""}
                    {a.createdBy.firstName} {a.createdBy.lastName} · {dayjs(a.updatedAt).format("DD MMM YYYY")}
                  </div>
                </div>
                <div className="row gap-1">
                  <PermissionGate module="operations" action="create">
                    <button className="ad-btn" title="Duplicate" onClick={() => duplicateMutation.mutate(a.id)}><Icon name="paperclip" size={12} /></button>
                  </PermissionGate>
                  <PermissionGate module="operations" action="delete">
                    <button className="ad-btn ad-btn-danger" onClick={() => setDeleting(a)}><Icon name="trash" size={12} /></button>
                  </PermissionGate>
                </div>
              </div>
              {expanded === a.id && <div className="ot-item-body">{a.content}</div>}
            </div>
          ))}
        </div>
      ) : (
        <div className="ad-empty">No knowledge base articles yet.</div>
      )}

      {showForm && (
        <FormModal title="New Knowledge Base Article" onClose={() => setShowForm(false)} onSubmit={() => createMutation.mutate()} submitting={createMutation.isPending}>
          <div className="field"><label>Title *</label><input className="input" value={title} onChange={(e) => setTitle(e.target.value)} /></div>
          <div className="field"><label>Category</label><input className="input" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="e.g. Networking" /></div>
          <div className="field"><label>Content *</label><textarea className="input" rows={8} value={content} onChange={(e) => setContent(e.target.value)} /></div>
        </FormModal>
      )}

      {deleting && (
        <ConfirmDialog
          title="Delete article"
          message={`Are you sure you want to delete "${deleting.title}"? This cannot be undone.`}
          danger
          loading={deleteMutation.isPending}
          onCancel={() => setDeleting(null)}
          onConfirm={() => deleteMutation.mutate(deleting.id)}
        />
      )}
    </div>
  );
}
