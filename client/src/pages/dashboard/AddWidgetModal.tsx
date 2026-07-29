import { FormModal } from "../../components/FormModal";
import { WIDGET_CATALOG } from "./widgets";

export function AddWidgetModal({ existingIds, onClose, onAdd }: { existingIds: string[]; onClose: () => void; onAdd: (id: string) => void }) {
  const available = WIDGET_CATALOG.filter((w) => !existingIds.includes(w.id));

  return (
    <FormModal title="Add Widget" onClose={onClose} hideFooter>
      {available.length === 0 ? (
        <div className="empty-state">All available widgets are already on your dashboard.</div>
      ) : (
        <div className="stack gap-1">
          {available.map((w) => (
            <div key={w.id} className="row" style={{ justifyContent: "space-between", padding: "8px 4px", borderBottom: "1px solid var(--color-border)" }}>
              <span style={{ fontSize: 13 }}>{w.title}</span>
              <button className="btn btn-primary btn-sm" onClick={() => { onAdd(w.id); }}>Add</button>
            </div>
          ))}
        </div>
      )}
    </FormModal>
  );
}
