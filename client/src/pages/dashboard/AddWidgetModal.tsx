import { FormModal } from "../../components/FormModal";
import { Icon } from "../../components/Icon";
import { WIDGET_CATALOG, WidgetDef } from "./widgets";

export function AddWidgetModal({
  existingIds,
  catalog = WIDGET_CATALOG,
  onClose,
  onAdd,
  onAddCustomQuery,
  onAddComparison,
}: {
  existingIds: string[];
  catalog?: WidgetDef[];
  onClose: () => void;
  onAdd: (id: string) => void;
  /** Only the home dashboard offers the full ad-hoc query-builder widget — module dashboards stay
   * scoped to their own catalog, with filtering handled per-widget instead. */
  onAddCustomQuery?: () => void;
  /** Same home-dashboard-only scoping as onAddCustomQuery, for the cross-module comparison widget. */
  onAddComparison?: () => void;
}) {
  const available = catalog.filter((w) => !existingIds.includes(w.id));

  return (
    <FormModal title="Add Widget" onClose={onClose} hideFooter>
      {onAddCustomQuery && (
        <div
          className="row"
          style={{ justifyContent: "space-between", alignItems: "center", padding: "8px 4px", borderBottom: "1px solid var(--color-border)", marginBottom: 4 }}
        >
          <div>
            <div style={{ fontSize: 13, fontWeight: 600 }}><Icon name="filter" size={12} /> Custom Query Widget</div>
            <div className="muted" style={{ fontSize: 11 }}>Build your own filtered view from any data source you have access to.</div>
          </div>
          <button className="btn btn-primary btn-sm" onClick={onAddCustomQuery}>Build</button>
        </div>
      )}
      {onAddComparison && (
        <div
          className="row"
          style={{ justifyContent: "space-between", alignItems: "center", padding: "8px 4px", borderBottom: "1px solid var(--color-border)", marginBottom: 4 }}
        >
          <div>
            <div style={{ fontSize: 13, fontWeight: 600 }}><Icon name="activity" size={12} /> Comparison Widget</div>
            <div className="muted" style={{ fontSize: 11 }}>Compare record counts across two or more modules in one chart.</div>
          </div>
          <button className="btn btn-primary btn-sm" onClick={onAddComparison}>Build</button>
        </div>
      )}
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
