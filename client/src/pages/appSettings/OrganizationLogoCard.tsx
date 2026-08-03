import { Icon } from "../../components/Icon";
import { PermissionGate } from "../../auth/PermissionGate";
import dayjs from "dayjs";

interface OrganizationRow {
  id: number;
  name: string;
  schemaName: string;
  createdAt: string;
  logoUrl: string | null;
}

// Grid-mode card for the Organizations table — passed as DataTable's `renderCard`. Shows the
// uploaded logo (or a placeholder), then the same manage/edit actions the list view's actions
// column offers.
export function OrganizationLogoCard({
  organization,
  isActive,
  disabled,
  onSwitch,
  onEdit,
}: {
  organization: OrganizationRow;
  isActive: boolean;
  disabled: boolean;
  onSwitch: () => void;
  onEdit: () => void;
}) {
  return (
    <div className="card stack gap-2">
      <div className="row gap-2" style={{ alignItems: "center" }}>
        <div
          className="avatar"
          style={{ width: 44, height: 44, borderRadius: 10, overflow: "hidden", flexShrink: 0, background: "var(--color-bg-subtle)" }}
        >
          {organization.logoUrl ? (
            <img src={organization.logoUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          ) : (
            <span style={{ display: "flex", width: "100%", height: "100%", alignItems: "center", justifyContent: "center" }}>
              <Icon name="briefcase" size={18} />
            </span>
          )}
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{organization.name}</div>
          <div className="muted" style={{ fontSize: 11, fontFamily: "monospace" }}>{organization.schemaName}</div>
        </div>
      </div>
      <div className="muted" style={{ fontSize: 11 }}>Created {dayjs(organization.createdAt).format("DD MMM YYYY")}</div>
      <div className="row gap-1">
        <button className="btn btn-secondary btn-sm" disabled={disabled} onClick={onSwitch}>
          <Icon name={isActive ? "check" : "arrowRight"} size={12} /> {isActive ? "Managing" : "Manage"}
        </button>
        <PermissionGate module="app-settings" action="edit">
          <button className="btn btn-secondary btn-sm btn-icon" title="Edit organization" onClick={onEdit}>
            <Icon name="edit" size={12} />
          </button>
        </PermissionGate>
      </div>
    </div>
  );
}
