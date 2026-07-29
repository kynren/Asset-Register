import { useNavigate } from "react-router-dom";
import dayjs from "dayjs";
import { Icon } from "../../../components/Icon";
import { AssetDetail } from "./types";

export function ImpactAnalysisTab({ asset }: { asset: AssetDetail }) {
  const navigate = useNavigate();

  const openTickets = asset.tickets.filter((t) => t.status === "OPEN" || t.status === "IN_PROGRESS");
  const urgentTickets = asset.tickets.filter((t) => t.priority === "URGENT" && t.status !== "CLOSED" && t.status !== "RESOLVED");
  const isOnline = asset.device ? Date.now() - new Date(asset.device.lastSeen).getTime() < 15 * 60 * 1000 : null;

  const reasons: string[] = [];
  let risk: "LOW" | "MEDIUM" | "HIGH" = "LOW";

  if (asset.status === "IN_REPAIR" || asset.status === "LOST") {
    risk = "HIGH";
    reasons.push(`Asset status is ${asset.status.replace("_", " ")}.`);
  }
  if (urgentTickets.length > 0) {
    risk = "HIGH";
    reasons.push(`${urgentTickets.length} urgent ticket(s) currently open against this asset.`);
  }
  if (risk === "LOW" && openTickets.length > 0) {
    risk = "MEDIUM";
    reasons.push(`${openTickets.length} open ticket(s) linked to this asset.`);
  }
  if (risk === "LOW" && asset.assignedTo && asset.status === "IN_USE") {
    risk = "MEDIUM";
    reasons.push(`In active use and assigned to ${asset.assignedTo.firstName} ${asset.assignedTo.lastName} — downtime would directly affect them.`);
  }
  if (asset.device && isOnline === false) {
    reasons.push("Linked device has not reported in over 15 minutes.");
  }
  if (reasons.length === 0) {
    reasons.push("No open tickets, and asset is currently unassigned or in storage.");
  }

  const riskClass = risk === "HIGH" ? "ad-badge-danger" : risk === "MEDIUM" ? "ad-badge-warning" : "ad-badge-success";

  return (
    <div>
      <div className="ad-content-header">
        <h2 className="ad-content-title"><Icon name="activity" size={16} /> Impact Analysis</h2>
        <p className="ad-content-subtitle">Risk and dependency assessment derived from this asset's live status, assignment, and ticket history.</p>
      </div>

      <div className="ad-grid">
        <div className="ad-panel">
          <div className="ad-panel-title">
            Risk Assessment
            <span className={`ad-badge ${riskClass}`}>{risk} IMPACT</span>
          </div>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: "var(--ad-text-muted)", lineHeight: 1.8 }}>
            {reasons.map((r, i) => <li key={i}>{r}</li>)}
          </ul>
        </div>

        <div className="ad-panel">
          <div className="ad-panel-title">Operational Dependency</div>
          <div className="ad-row-card">
            <div>
              <div className="ad-row-label">Assigned Operator</div>
              <div className="ad-row-value">{asset.assignedTo ? `${asset.assignedTo.firstName} ${asset.assignedTo.lastName}` : "Unassigned"}</div>
            </div>
          </div>
          <div className="ad-row-card">
            <div>
              <div className="ad-row-label">Device Connectivity</div>
              <div className="ad-row-value">{asset.device ? (isOnline ? "Online" : "Offline") : "No device linked"}</div>
            </div>
          </div>
          <div className="ad-row-card">
            <div>
              <div className="ad-row-label">Current Status</div>
              <div className="ad-row-value">{asset.status.replace("_", " ")}</div>
            </div>
          </div>
        </div>
      </div>

      <div className="ad-panel" style={{ marginTop: 18 }}>
        <div className="ad-panel-title">Linked Tickets ({asset.tickets.length})</div>
        {asset.tickets.length > 0 ? (
          <table className="ad-table">
            <thead>
              <tr><th>Ticket</th><th>Title</th><th>Status</th><th>Priority</th><th>Created</th></tr>
            </thead>
            <tbody>
              {asset.tickets.map((t) => (
                <tr key={t.id} style={{ cursor: "pointer" }} onClick={() => navigate(`/helpdesk/${t.id}`)}>
                  <td>{t.ticketNumber}</td>
                  <td>{t.title}</td>
                  <td>{t.status.replace("_", " ")}</td>
                  <td>{t.priority}</td>
                  <td>{dayjs(t.createdAt).format("DD MMM YYYY")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="ad-empty">No tickets have been raised for this asset.</div>
        )}
      </div>
    </div>
  );
}
