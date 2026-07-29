import { useQuery } from "@tanstack/react-query";
import dayjs from "dayjs";
import { axiosClient } from "../../../api/axiosClient";
import { Icon } from "../../../components/Icon";
import { AssetDetail } from "./types";
import { SkeletonText } from "../../../components/Skeleton";

interface ReportCheckout {
  id: number;
  checkedOutAt: string;
  dueBackAt: string | null;
  checkedInAt: string | null;
  checkedOutTo: { firstName: string; lastName: string };
  checkedOutBy: { firstName: string; lastName: string };
}

interface ReportLicenseAssignment {
  id: number;
  assignedAt: string;
  license: { id: number; name: string; vendor: string | null };
}

interface ReportActivity {
  id: number;
  action: string;
  createdAt: string;
  user: { firstName: string; lastName: string } | null;
}

interface ReportResponse {
  asset: AssetDetail & {
    checkouts: ReportCheckout[];
    licenseAssignments: ReportLicenseAssignment[];
    _count: {
      components: number;
      volumes: number;
      connections: number;
      networkPorts: number;
      sockets: number;
      contracts: number;
      documents: number;
      photos: number;
      bookings: number;
    };
  };
  recentActivity: ReportActivity[];
}

function fmt(d: string | null) {
  return d ? dayjs(d).format("DD MMM YYYY") : "—";
}

export function ReportTab({ asset }: { asset: AssetDetail }) {
  const { data, isLoading } = useQuery({
    queryKey: ["asset-report", asset.id],
    queryFn: async () => (await axiosClient.get(`/assets/${asset.id}/report`)).data as ReportResponse,
  });

  async function downloadPdf() {
    const res = await axiosClient.get(`/assets/${asset.id}/report/pdf`, { responseType: "blob" });
    const url = window.URL.createObjectURL(res.data);
    const a = document.createElement("a");
    a.href = url;
    a.download = `asset-${asset.assetTag}-report.pdf`;
    a.click();
    window.URL.revokeObjectURL(url);
  }

  if (isLoading || !data) {
    return (
      <div className="ad-grid">
        {[5, 3, 4].map((lines, i) => (
          <div className="ad-panel" key={i}>
            <SkeletonText lines={lines} />
          </div>
        ))}
      </div>
    );
  }

  const { asset: full, recentActivity } = data;
  const c = full._count;
  const activeCheckout = full.checkouts.find((c2) => !c2.checkedInAt);

  return (
    <div>
      <div className="ad-content-header" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <h2 className="ad-content-title"><Icon name="activity" size={16} /> Asset Report</h2>
          <p className="ad-content-subtitle">A consolidated, exportable summary of this asset's identity, lifecycle, and usage.</p>
        </div>
        <button className="ad-btn ad-btn-primary" onClick={downloadPdf}>
          <Icon name="download" size={13} /> Download PDF
        </button>
      </div>

      <div className="ad-grid">
        <div className="ad-panel">
          <div className="ad-panel-title">Overview</div>
          <div className="ad-row-card"><div><div className="ad-row-label">Asset Tag</div><div className="ad-row-value">{full.assetTag}</div></div></div>
          <div className="ad-row-card"><div><div className="ad-row-label">Category</div><div className="ad-row-value">{full.category?.name ?? "Uncategorized"}</div></div></div>
          <div className="ad-row-card"><div><div className="ad-row-label">Status</div><div className="ad-row-value">{full.status.replace("_", " ")} · {full.signOffStatus}</div></div></div>
          <div className="ad-row-card"><div><div className="ad-row-label">Location</div><div className="ad-row-value">{full.location?.name ?? "—"}</div></div></div>
          <div className="ad-row-card"><div><div className="ad-row-label">Manufacturer / Model</div><div className="ad-row-value">{full.manufacturer ?? "—"} / {full.model ?? "—"}</div></div></div>
          <div className="ad-row-card"><div><div className="ad-row-label">Serial Number</div><div className="ad-row-value">{full.serialNumber ?? "—"}</div></div></div>
        </div>

        <div className="ad-panel">
          <div className="ad-panel-title">Financial &amp; Warranty</div>
          <div className="ad-row-card"><div><div className="ad-row-label">Purchase Date</div><div className="ad-row-value">{fmt(full.purchaseDate)}</div></div></div>
          <div className="ad-row-card"><div><div className="ad-row-label">Purchase Cost</div><div className="ad-row-value">{full.purchaseCost ?? "—"}</div></div></div>
          <div className="ad-row-card"><div><div className="ad-row-label">Warranty Expires</div><div className="ad-row-value">{fmt(full.warrantyExpiresAt)}</div></div></div>
          <div className="ad-row-card"><div><div className="ad-row-label">Next Service Date</div><div className="ad-row-value">{fmt(full.nextServiceDate)}</div></div></div>
        </div>

        {full.customFieldValues && full.customFieldValues.length > 0 && (
          <div className="ad-panel">
            <div className="ad-panel-title">Custom Fields</div>
            {full.customFieldValues.map((v) => (
              <div className="ad-row-card" key={v.id}>
                <div><div className="ad-row-label">{v.field.label}</div><div className="ad-row-value">{v.value ?? "—"}</div></div>
              </div>
            ))}
          </div>
        )}

        <div className="ad-panel">
          <div className="ad-panel-title">Sub-Resource Summary</div>
          <div className="grid grid-cols-3" style={{ gap: 10 }}>
            {[
              ["Components", c.components], ["Volumes", c.volumes], ["Connections", c.connections],
              ["Network Ports", c.networkPorts], ["Sockets", c.sockets], ["Photos", c.photos],
              ["Contracts", c.contracts], ["Documents", c.documents], ["Bookings", c.bookings],
            ].map(([label, value]) => (
              <div className="ad-row-card" key={label as string} style={{ flexDirection: "column", alignItems: "flex-start" }}>
                <div className="ad-row-label">{label}</div>
                <div className="ad-row-value" style={{ fontSize: 18 }}>{value}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="ad-panel">
          <div className="ad-panel-title">Custody &amp; Checkout</div>
          <div className="ad-row-card">
            <div><div className="ad-row-label">Current Custodian</div><div className="ad-row-value">{activeCheckout ? `${activeCheckout.checkedOutTo.firstName} ${activeCheckout.checkedOutTo.lastName}` : (full.assignedTo ? `${full.assignedTo.firstName} ${full.assignedTo.lastName}` : "Unassigned")}</div></div>
          </div>
          <div className="ad-row-card">
            <div><div className="ad-row-label">Total Checkouts on Record</div><div className="ad-row-value">{full.checkouts.length}</div></div>
          </div>
        </div>

        {full.licenseAssignments.length > 0 && (
          <div className="ad-panel">
            <div className="ad-panel-title">Licenses Assigned</div>
            {full.licenseAssignments.map((la) => (
              <div className="ad-row-card" key={la.id}>
                <div><div className="ad-row-label">{la.license.vendor ?? "License"}</div><div className="ad-row-value">{la.license.name}</div></div>
                <div className="ad-row-label" style={{ textTransform: "none" }}>Since {fmt(la.assignedAt)}</div>
              </div>
            ))}
          </div>
        )}

        <div className="ad-panel">
          <div className="ad-panel-title">Tickets</div>
          {full.tickets.length > 0 ? (
            full.tickets.map((t) => (
              <div className="ad-row-card" key={t.id}>
                <div><div className="ad-row-label">{t.ticketNumber}</div><div className="ad-row-value">{t.title}</div></div>
                <span className="ad-badge ad-badge-neutral">{t.status}</span>
              </div>
            ))
          ) : (
            <div className="ad-empty">No tickets logged against this asset.</div>
          )}
        </div>

        <div className="ad-panel">
          <div className="ad-panel-title">Recent Activity</div>
          {recentActivity.length > 0 ? (
            recentActivity.slice(0, 8).map((a) => (
              <div className="ad-row-card" key={a.id}>
                <div>
                  <div className="ad-row-value">{a.action}</div>
                  <div className="ad-row-label" style={{ textTransform: "none" }}>
                    {a.user ? `${a.user.firstName} ${a.user.lastName}` : "System"} · {dayjs(a.createdAt).format("DD MMM YYYY, HH:mm")}
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="ad-empty">No activity recorded yet.</div>
          )}
          <p className="muted" style={{ fontSize: 11, marginTop: 8 }}>See the Logs tab for the full activity history.</p>
        </div>
      </div>
    </div>
  );
}
