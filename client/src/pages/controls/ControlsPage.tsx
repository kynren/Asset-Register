import { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, Navigate } from "react-router-dom";
import { axiosClient } from "../../api/axiosClient";
import { Icon } from "../../components/Icon";
import { Skeleton } from "../../components/Skeleton";
import { useAuth } from "../../auth/AuthContext";
import { CONTROLS_MODULES } from "./ControlsSubNav";

interface NvrWithCameras {
  id: number;
  status: "ONLINE" | "OFFLINE";
  cameras: { id: number }[];
}
interface AccessControlDeviceWithDoors {
  id: number;
  status: "ONLINE" | "OFFLINE";
  doors: { id: number }[];
}
interface LightingSummary {
  totalDevices: number;
  devicesOn: number;
  roomsCount: number;
}
interface Net2ServerSnippet {
  id: number;
  status: "ONLINE" | "OFFLINE" | "UNKNOWN";
}

function SnippetShell({ icon, label, description, path, children }: { icon: string; label: string; description: string; path: string; children: ReactNode }) {
  return (
    <Link to={path} className="card" style={{ display: "block", textDecoration: "none", color: "inherit", transition: "box-shadow 0.2s ease, transform 0.2s ease" }}>
      <div className="row gap-2" style={{ alignItems: "center", marginBottom: 8 }}>
        <div style={{ width: 36, height: 36, borderRadius: 10, background: "var(--color-primary-soft)", color: "var(--color-primary)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <Icon name={icon} size={18} />
        </div>
        <strong style={{ fontSize: 15 }}>{label}</strong>
        <Icon name="chevronRight" size={16} style={{ marginLeft: "auto", color: "var(--color-text-muted)" }} />
      </div>
      <p className="muted" style={{ fontSize: 12, margin: "0 0 14px" }}>{description}</p>
      {children}
    </Link>
  );
}

function StatRow({ stats }: { stats: { label: string; value: string | number; tone?: "success" | "warning" | "danger" }[] }) {
  return (
    <div className="row gap-3 flex-wrap" style={{ paddingTop: 10, borderTop: "1px solid var(--color-border)" }}>
      {stats.map((s) => (
        <div key={s.label}>
          <div style={{ fontSize: 18, fontWeight: 700, color: s.tone ? `var(--color-${s.tone})` : undefined }}>{s.value}</div>
          <div className="muted" style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5 }}>{s.label}</div>
        </div>
      ))}
    </div>
  );
}

function NvrSnippetCard() {
  const { data, isLoading } = useQuery({
    queryKey: ["controls-nvr-snippet"],
    queryFn: async () => (await axiosClient.get("/nvr")).data as NvrWithCameras[],
  });
  const cameraCount = (data ?? []).reduce((sum, n) => sum + n.cameras.length, 0);
  const onlineCount = (data ?? []).filter((n) => n.status === "ONLINE").length;

  return (
    <SnippetShell icon="nvr" label="NVRs & Cameras" description="Live video matrix, playback, discovery, and device configuration." path="/nvr">
      {isLoading ? <Skeleton height={40} /> : (
        <StatRow
          stats={[
            { label: "NVRs", value: data?.length ?? 0 },
            { label: "Cameras", value: cameraCount },
            { label: "Online", value: onlineCount, tone: "success" },
          ]}
        />
      )}
    </SnippetShell>
  );
}

function AccessControlSnippetCard() {
  const { data, isLoading } = useQuery({
    queryKey: ["controls-access-control-snippet"],
    queryFn: async () => (await axiosClient.get("/access-control/devices")).data as AccessControlDeviceWithDoors[],
  });
  const doorCount = (data ?? []).reduce((sum, d) => sum + d.doors.length, 0);
  const onlineCount = (data ?? []).filter((d) => d.status === "ONLINE").length;

  return (
    <SnippetShell icon="key" label="Access Control" description="Doors, persons, access groups, credentials, and the access event log." path="/access-control">
      {isLoading ? <Skeleton height={40} /> : (
        <StatRow
          stats={[
            { label: "Devices", value: data?.length ?? 0 },
            { label: "Doors", value: doorCount },
            { label: "Online", value: onlineCount, tone: "success" },
          ]}
        />
      )}
    </SnippetShell>
  );
}

function LightingSnippetCard() {
  const { data, isLoading } = useQuery({
    queryKey: ["controls-lighting-snippet"],
    queryFn: async () => (await axiosClient.get("/lighting/dashboard-summary")).data as LightingSummary,
  });

  return (
    <SnippetShell icon="bulb" label="Lighting" description="Lighting and IoT devices over the local network, scenes, automations, and the site map." path="/lighting">
      {isLoading ? <Skeleton height={40} /> : (
        <StatRow
          stats={[
            { label: "Devices", value: data?.totalDevices ?? 0 },
            { label: "On", value: data?.devicesOn ?? 0, tone: "success" },
            { label: "Locations", value: data?.roomsCount ?? 0 },
          ]}
        />
      )}
    </SnippetShell>
  );
}

function GatesSnippetCard() {
  const { data, isLoading } = useQuery({
    queryKey: ["controls-gates-snippet"],
    queryFn: async () => (await axiosClient.get("/gates/servers")).data as Net2ServerSnippet[],
  });
  const onlineCount = (data ?? []).filter((s) => s.status === "ONLINE").length;

  return (
    <SnippetShell icon="door" label="Gates" description="Paxton Net2 gate controller servers — discovery and registration." path="/gates">
      {isLoading ? <Skeleton height={40} /> : (
        <StatRow
          stats={[
            { label: "Servers", value: data?.length ?? 0 },
            { label: "Online", value: onlineCount, tone: "success" },
          ]}
        />
      )}
    </SnippetShell>
  );
}

const SNIPPET_CARDS: Record<string, () => JSX.Element> = {
  nvr: NvrSnippetCard,
  "access-control": AccessControlSnippetCard,
  lighting: LightingSnippetCard,
  gates: GatesSnippetCard,
};

// Landing page for the "Controls" area — NVRs & Cameras, Access Control, and Lighting used to be
// flat sidebar sub-items; now the sidebar has one "Controls" entry pointing here, and each of the
// three becomes its own top-level page reachable both from this grid and from the ControlsSubNav
// cross-links rendered on each of those pages. RBAC-filtered exactly like the old sidebar group —
// a card only appears if the signed-in user has view access to that module.
export function ControlsPage() {
  const { hasPermission } = useAuth();
  const visible = CONTROLS_MODULES.filter((m) => hasPermission(m.module, "view"));

  if (visible.length === 0) return <Navigate to="/" replace />;

  return (
    <div className="stack gap-3">
      <div className="page-header-sticky">
        <div className="page-header-content">
          <div>
            <h1 className="page-title">Controls</h1>
            <p className="page-subtitle">Physical and site-control systems — video, access, and lighting — in one place.</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {visible.map((m) => {
          const Card = SNIPPET_CARDS[m.module];
          return <Card key={m.module} />;
        })}
      </div>
    </div>
  );
}
