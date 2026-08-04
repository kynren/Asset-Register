import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import dayjs from "dayjs";
import { axiosClient } from "../../../api/axiosClient";
import { Icon } from "../../../components/Icon";
import { FormModal } from "../../../components/FormModal";
import { PermissionGate } from "../../../auth/PermissionGate";
import { ConfirmDialog } from "../../../components/ConfirmDialog";
import { SkeletonText } from "../../../components/Skeleton";
import { AccessGrant, AccessGrantPicker, AccessLevel, ManageAccessModal, canDeleteRecord, canEditRecord, canManageRecordAccess } from "../../../components/AccessControl";
import { useAuth } from "../../../auth/AuthContext";

interface Article {
  id: number;
  title: string;
  content: string;
  category: string | null;
  createdById: number;
  createdBy: { id: number; firstName: string; lastName: string };
  createdAt: string;
  updatedAt: string;
  access: AccessGrant[];
}

const QUERY_KEY = ["op-knowledge"];

export function KnowledgeBaseTab() {
  const queryClient = useQueryClient();
  const { user, myTeamIds } = useAuth();
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Article | null>(null);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [deleting, setDeleting] = useState<Article | null>(null);
  const [managingAccessId, setManagingAccessId] = useState<number | null>(null);

  const { data: articles, isLoading } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: async () => (await axiosClient.get("/operations/knowledge", { params: { search: search || undefined } })).data as Article[],
  });
  const { data: users } = useQuery({ queryKey: ["users-directory"], queryFn: async () => (await axiosClient.get("/users/directory")).data });
  const { data: teams } = useQuery({ queryKey: ["teams-directory"], queryFn: async () => (await axiosClient.get("/teams/directory")).data });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => axiosClient.delete(`/operations/knowledge/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: QUERY_KEY }); setDeleting(null); },
  });

  const duplicateMutation = useMutation({
    mutationFn: (id: number) => axiosClient.post(`/operations/knowledge/${id}/duplicate`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
  });

  const managingAccess = managingAccessId ? articles?.find((a) => a.id === managingAccessId) ?? null : null;

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
          {articles.map((a) => {
            const canEdit = !!user && canEditRecord(a.createdById, a.access, user.id, user.roleName, myTeamIds);
            const canDelete = !!user && canDeleteRecord(a.createdById, a.access, user.id, user.roleName, myTeamIds);
            const canManageAccess = !!user && canManageRecordAccess(a.createdById, user.id, user.roleName);
            return (
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
                    {canManageAccess && (
                      <button className="ad-btn" title="Manage Access" onClick={() => setManagingAccessId(a.id)}><Icon name="profile" size={12} /> {a.access.length}</button>
                    )}
                    <PermissionGate module="operations" action="create">
                      <button className="ad-btn" title="Duplicate" onClick={() => duplicateMutation.mutate(a.id)}><Icon name="paperclip" size={12} /></button>
                    </PermissionGate>
                    {canEdit && (
                      <button className="ad-btn" title="Edit" onClick={() => setEditing(a)}><Icon name="edit" size={12} /></button>
                    )}
                    {canDelete && (
                      <button className="ad-btn ad-btn-danger" title="Delete" onClick={() => setDeleting(a)}><Icon name="trash" size={12} /></button>
                    )}
                  </div>
                </div>
                {expanded === a.id && <div className="ot-item-body">{a.content}</div>}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="ad-empty">No knowledge base articles yet.</div>
      )}

      {(showForm || editing) && (
        <ArticleFormModal initial={editing} users={users ?? []} teams={teams ?? []} onClose={() => { setShowForm(false); setEditing(null); }} />
      )}

      {managingAccess && user && (
        <ManageAccessModal
          title={managingAccess.title}
          apiBasePath={`/operations/knowledge/${managingAccess.id}`}
          access={managingAccess.access}
          createdById={managingAccess.createdById}
          users={users ?? []}
          teams={teams ?? []}
          queryKey={QUERY_KEY}
          onClose={() => setManagingAccessId(null)}
        />
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

function ArticleFormModal({ initial, users, teams, onClose }: { initial: Article | null; users: any[]; teams: any[]; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState(initial?.title ?? "");
  const [content, setContent] = useState(initial?.content ?? "");
  const [category, setCategory] = useState(initial?.category ?? "");
  const [newAccess, setNewAccess] = useState<{ userId?: string; teamId?: string; level: AccessLevel }[]>([]);

  const mutation = useMutation({
    mutationFn: () => {
      const payload = {
        title,
        content,
        category: category || undefined,
        ...(initial ? {} : { access: newAccess.map((a) => (a.userId != null ? { userId: Number(a.userId), level: a.level } : { teamId: Number(a.teamId), level: a.level })) }),
      };
      return initial ? axiosClient.patch(`/operations/knowledge/${initial.id}`, payload) : axiosClient.post("/operations/knowledge", payload);
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: QUERY_KEY }); onClose(); },
  });

  return (
    <FormModal title={initial ? "Edit Article" : "New Knowledge Base Article"} onClose={onClose} onSubmit={() => mutation.mutate()} submitting={mutation.isPending} submitDisabled={!title.trim() || !content.trim()}>
      <div className="field"><label>Title *</label><input className="input" value={title} onChange={(e) => setTitle(e.target.value)} /></div>
      <div className="field"><label>Category</label><input className="input" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="e.g. Networking" /></div>
      <div className="field"><label>Content *</label><textarea className="input" rows={8} value={content} onChange={(e) => setContent(e.target.value)} /></div>
      {!initial && <AccessGrantPicker users={users} teams={teams} value={newAccess} onChange={setNewAccess} />}
    </FormModal>
  );
}
