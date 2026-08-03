import { useQuery } from "@tanstack/react-query";
import { axiosClient } from "../../api/axiosClient";
import { FormModal } from "../../components/FormModal";
import { Icon } from "../../components/Icon";
import { DashboardSummary } from "./DashboardPickerBar";

export function SharedWithMeModal({ module, onClose, onOpen }: { module: string; onClose: () => void; onOpen: (id: number) => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ["dashboards-shared-with-me", module],
    queryFn: async () => (await axiosClient.get("/dashboard/dashboards/shared-with-me", { params: { module } })).data as DashboardSummary[],
  });

  return (
    <FormModal title="Shared with Me" onClose={onClose} hideFooter maxWidth={480}>
      {isLoading ? (
        <div className="muted">Loading...</div>
      ) : !data || data.length === 0 ? (
        <div className="empty-state">No dashboards have been shared with you for this page yet.</div>
      ) : (
        <div className="stack gap-1">
          {data.map((d) => (
            <div key={d.id} className="row" style={{ justifyContent: "space-between", alignItems: "center", padding: "8px 4px", borderBottom: "1px solid var(--color-border)" }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{d.name}</div>
                <div className="muted" style={{ fontSize: 11 }}>
                  Shared by {d.ownerName} · {d.canEdit ? "Can edit" : "View only"}
                </div>
              </div>
              <button className="btn btn-primary btn-sm" onClick={() => onOpen(d.id)}>
                <Icon name="eye" size={12} /> Open
              </button>
            </div>
          ))}
        </div>
      )}
    </FormModal>
  );
}
