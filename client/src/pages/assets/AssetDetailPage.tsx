import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import QRCode from "qrcode";
import dayjs from "dayjs";
import { axiosClient } from "../../api/axiosClient";
import { Icon } from "../../components/Icon";
import { AssetDetail } from "./detail/types";
import { HarnessDetailPage } from "./HarnessDetailPage";
import { AssetProfileTab } from "./detail/AssetProfileTab";
import { ImpactAnalysisTab } from "./detail/ImpactAnalysisTab";
import { LocationHistoryTab } from "./detail/LocationHistoryTab";
import { OperatingSystemsTab } from "./detail/OperatingSystemsTab";
import { SoftwareTab } from "./detail/SoftwareTab";
import { ManagementTab } from "./detail/ManagementTab";
import { RemoteManagementTab } from "./detail/RemoteManagementTab";
import { VirtualizationTab } from "./detail/VirtualizationTab";
import { AntivirusTab } from "./detail/AntivirusTab";
import { SubResourceTab } from "./detail/SubResourceTab";
import { NetworkSettingsCard } from "./detail/NetworkSettingsCard";
import { FileResourceTab } from "./detail/FileResourceTab";
import { ReportTab } from "./detail/ReportTab";
import { ActivityLogTab } from "./detail/ActivityLogTab";
import { AssetFinancialTab } from "./detail/AssetFinancialTab";
import { Skeleton, SkeletonText } from "../../components/Skeleton";
import { hasCapacity } from "./assetCapacities";

// Mirrors the exact format the agent writes in agent/kynren_agent.py get_disk_info():
// "C:\\ 512.0GB total, 200.0GB free; D:\\ 1024.0GB total, 400.0GB free"
function parseDiskInfo(diskInfo: string | null | undefined): { label: string; totalGb: string; freeGb: string; fileSystem: string }[] {
  if (!diskInfo) return [];
  return diskInfo
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const m = part.match(/^(.+?)\s+([\d.]+)GB total,\s*([\d.]+)GB free$/i);
      return m ? { label: m[1], totalGb: m[2], freeGb: m[3], fileSystem: "—" } : { label: part, totalGb: "—", freeGb: "—", fileSystem: "—" };
    });
}

type TabKey =
  | "profile" | "impact" | "location" | "os" | "components" | "volumes" | "software"
  | "connections" | "networkPorts" | "sockets" | "remoteManagement" | "management"
  | "contracts" | "documents" | "financialInfo" | "virtualization" | "antivirus" | "reports" | "logs";

// Nav is assembled by buildNavItems() below. The IT-specific tabs (Operating Systems, Volumes,
// Software, Connections, Network Ports, Sockets, Remote Management, Virtualization, Antiviruses)
// still follow the category's isComputerAsset flag. Components/Contracts/Documents/Financial Info
// are independently toggled per-category via AssetCategory.capacities (see assetCapacities.ts) —
// `null` capacities falls back to the pre-Capacities behavior (Components follows isComputerAsset,
// the other three always show), so existing categories are unaffected until an admin opts in.
const LEAD_ITEMS: { key: TabKey; label: string; icon: string }[] = [
  { key: "profile", label: "Asset Profile", icon: "profile" },
  { key: "impact", label: "Impact Analysis", icon: "activity" },
  { key: "location", label: "Location History & Map", icon: "mapPin" },
];

const OS_ITEM: { key: TabKey; label: string; icon: string } = { key: "os", label: "Operating systems", icon: "layers" };
const COMPONENTS_ITEM: { key: TabKey; label: string; icon: string } = { key: "components", label: "Components", icon: "cpu" };
const COMPUTER_NAV_ITEMS_MID: { key: TabKey; label: string; icon: string }[] = [
  { key: "volumes", label: "Volumes", icon: "hardDrive" },
  { key: "software", label: "Software", icon: "code" },
  { key: "connections", label: "Connections", icon: "link" },
  { key: "networkPorts", label: "Network Ports", icon: "network" },
  { key: "sockets", label: "Sockets", icon: "plug" },
  { key: "remoteManagement", label: "Remote management", icon: "terminal" },
];

const MANAGEMENT_ITEM: { key: TabKey; label: string; icon: string } = { key: "management", label: "Management", icon: "briefcase" };
const CONTRACTS_ITEM: { key: TabKey; label: string; icon: string } = { key: "contracts", label: "Contracts", icon: "fileText" };
const DOCUMENTS_ITEM: { key: TabKey; label: string; icon: string } = { key: "documents", label: "Documents", icon: "file" };
const FINANCIAL_ITEM: { key: TabKey; label: string; icon: string } = { key: "financialInfo", label: "Financial & Admin Info", icon: "creditCard" };

const COMPUTER_NAV_ITEMS_LATE: { key: TabKey; label: string; icon: string }[] = [
  { key: "virtualization", label: "Virtualization", icon: "cloud" },
  { key: "antivirus", label: "Antiviruses", icon: "shield" },
];

const TAIL_ITEMS: { key: TabKey; label: string; icon: string }[] = [
  { key: "reports", label: "Reports", icon: "activity" },
  { key: "logs", label: "Logs", icon: "clock" },
];

function buildNavItems(category: { isComputerAsset: boolean; capacities?: unknown } | null | undefined) {
  const isComputerAsset = category?.isComputerAsset ?? false;
  return [
    ...LEAD_ITEMS,
    ...(isComputerAsset ? [OS_ITEM] : []),
    ...(hasCapacity(category, "components") ? [COMPONENTS_ITEM] : []),
    ...(isComputerAsset ? COMPUTER_NAV_ITEMS_MID : []),
    MANAGEMENT_ITEM,
    ...(hasCapacity(category, "contracts") ? [CONTRACTS_ITEM] : []),
    ...(hasCapacity(category, "documents") ? [DOCUMENTS_ITEM] : []),
    ...(hasCapacity(category, "financialInfo") ? [FINANCIAL_ITEM] : []),
    ...(isComputerAsset ? COMPUTER_NAV_ITEMS_LATE : []),
    ...TAIL_ITEMS,
  ];
}

export function AssetDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<TabKey>("profile");
  const qrRef = useRef<HTMLCanvasElement>(null);

  const { data: asset, isLoading } = useQuery({
    queryKey: ["asset", id],
    queryFn: async () => (await axiosClient.get(`/assets/${id}`)).data as AssetDetail,
  });

  useEffect(() => {
    if (qrRef.current && asset) {
      QRCode.toCanvas(qrRef.current, asset.assetTag, { width: 130, margin: 1 }).catch(() => undefined);
    }
  }, [asset]);

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["asset", id] });
  }

  if (isLoading || !asset) {
    return (
      <div className="ad-shell">
        <div className="ad-header">
          <Skeleton width={220} height={22} />
        </div>
        <div className="ad-body">
          <div className="ad-sidebar">
            <Skeleton height={16} width="60%" />
            <div className="stack gap-2" style={{ marginTop: 12 }}>
              {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} height={30} />)}
            </div>
          </div>
          <div className="ad-content">
            <div className="ad-panel"><SkeletonText lines={6} /></div>
          </div>
        </div>
      </div>
    );
  }

  if (asset.category?.name === "Harness") {
    return <HarnessDetailPage asset={asset} onUpdated={invalidate} />;
  }

  const isOnline = asset.device ? Date.now() - new Date(asset.device.lastSeen).getTime() < 15 * 60 * 1000 : null;
  const isActive = isOnline ?? asset.status === "IN_USE";
  const navItems = buildNavItems(asset.category);

  return (
    <div className="ad-shell">
      <div className="ad-header">
        <div className="ad-header-left">
          <button className="ad-back-btn" onClick={() => navigate("/assets")} title="Back to Asset Inventory">
            <Icon name="arrowLeft" size={16} />
          </button>
          <div className="ad-title-block">
            <div className="ad-title-row">
              <h1 className="ad-title">{asset.name}</h1>
              <span className="ad-tag-badge">{asset.assetTag}</span>
            </div>
            <div className="ad-meta-row">
              <span>
                <span className={`ad-status-dot status-flash ${isOnline ? "online" : "offline"}`} />
                IP Node: <strong>{asset.device?.ipAddresses?.[0] ?? "Not linked"}</strong>
              </span>
              <span>Category: <strong>{asset.category?.name ?? "Uncategorized"}</strong></span>
            </div>
          </div>
        </div>
        <div className="ad-header-right">
          <div className="ad-last-seen">
            <Icon name="activity" size={12} />
            Last Seen: {asset.device ? dayjs(asset.device.lastSeen).format("h:mm:ss A") : "—"}
          </div>
          <div className={`ad-active-badge ${isActive ? "" : "inactive"}`}>{isActive ? "ACTIVE" : "INACTIVE"}</div>
        </div>
      </div>

      <div className="ad-body">
        <div className="ad-sidebar">
          <div className="ad-nav-label">Asset Explorer</div>
          {navItems.map((item) => (
            <button
              key={item.key}
              className={`ad-nav-item ${tab === item.key ? "active" : ""}`}
              onClick={() => setTab(item.key)}
            >
              <Icon name={item.icon} size={15} />
              {item.label}
            </button>
          ))}

          <div className="ad-qr-panel">
            <div className="ad-qr-label">Asset QR Code</div>
            <div className="ad-qr-box">
              <canvas ref={qrRef} />
            </div>
          </div>
        </div>

        <div className="ad-content">
          {tab === "profile" && <AssetProfileTab asset={asset} onUpdated={invalidate} />}
          {tab === "impact" && <ImpactAnalysisTab asset={asset} />}
          {tab === "location" && <LocationHistoryTab asset={asset} />}
          {tab === "os" && <OperatingSystemsTab asset={asset} />}
          {tab === "components" && (
            <SubResourceTab
              assetId={asset.id}
              resource="components"
              title="Components"
              subtitle="Hardware components installed in this asset (CPU, RAM, GPU, motherboard, etc.)."
              addLabel="Add Component"
              columns={[{ key: "type", label: "Type" }, { key: "name", label: "Name" }, { key: "details", label: "Details" }]}
              fields={[
                { key: "type", label: "Type", required: true, placeholder: "e.g. CPU" },
                { key: "name", label: "Name", required: true, placeholder: "e.g. Intel i7-1355U" },
                { key: "details", label: "Details", placeholder: "Optional notes" },
              ]}
            />
          )}
          {tab === "volumes" && (
            <SubResourceTab
              assetId={asset.id}
              resource="volumes"
              title="Volumes"
              subtitle="Disk volumes and storage partitions tracked for this asset."
              addLabel="Add Volume"
              columns={[{ key: "label", label: "Label" }, { key: "totalGb", label: "Total (GB)" }, { key: "freeGb", label: "Free (GB)" }, { key: "fileSystem", label: "File System" }]}
              fields={[
                { key: "label", label: "Label", required: true, placeholder: "e.g. C:\\" },
                { key: "totalGb", label: "Total (GB)", type: "number", placeholder: "512" },
                { key: "freeGb", label: "Free (GB)", type: "number", placeholder: "128" },
                { key: "fileSystem", label: "File System", placeholder: "NTFS" },
              ]}
              agentRows={parseDiskInfo(asset.device?.diskInfo)}
              agentSectionLabel="Disk volumes reported by the Kynren agent"
            />
          )}
          {tab === "software" && <SoftwareTab asset={asset} />}
          {tab === "connections" && (
            <>
              <NetworkSettingsCard asset={asset} onUpdated={invalidate} />
              <SubResourceTab
                assetId={asset.id}
                resource="connections"
                title="Connections"
                subtitle="Cables, peripherals, and network connections attached to this asset."
                addLabel="Add Connection"
                columns={[{ key: "label", label: "Label" }, { key: "type", label: "Type" }, { key: "target", label: "Connected To" }]}
                fields={[
                  { key: "label", label: "Label", required: true, placeholder: "e.g. Uplink" },
                  { key: "type", label: "Type", placeholder: "Ethernet / Wi-Fi / USB" },
                  { key: "target", label: "Connected To", placeholder: "e.g. Switch Port 4" },
                ]}
                agentRows={
                  asset.device
                    ? [
                        ...asset.device.ipAddresses.map((ip, i) => ({
                          label: i === 0 ? "Primary Network Adapter" : `Network Adapter ${i + 1}`,
                          type: "Network",
                          target: ip,
                        })),
                        { label: "MAC Address", type: "Physical", target: asset.device.macAddress },
                      ]
                    : []
                }
                agentSectionLabel="Network identity reported by the Kynren agent"
              />
            </>
          )}
          {tab === "networkPorts" && (
            <SubResourceTab
              assetId={asset.id}
              resource="network-ports"
              title="Network Ports"
              subtitle="Logical network ports/services exposed by this asset."
              addLabel="Add Port"
              columns={[{ key: "portNumber", label: "Port" }, { key: "protocol", label: "Protocol" }, { key: "serviceName", label: "Service" }, { key: "status", label: "Status" }]}
              fields={[
                { key: "portNumber", label: "Port", required: true, type: "number", placeholder: "443" },
                { key: "protocol", label: "Protocol", placeholder: "TCP / UDP" },
                { key: "serviceName", label: "Service", placeholder: "HTTPS" },
                { key: "status", label: "Status", placeholder: "Open / Closed" },
              ]}
            />
          )}
          {tab === "sockets" && (
            <SubResourceTab
              assetId={asset.id}
              resource="sockets"
              title="Sockets"
              subtitle="Physical power, network, or USB sockets used by this asset."
              addLabel="Add Socket"
              columns={[{ key: "label", label: "Label" }, { key: "type", label: "Type" }, { key: "location", label: "Location" }]}
              fields={[
                { key: "label", label: "Label", required: true, placeholder: "e.g. Rack A - Socket 3" },
                { key: "type", label: "Type", placeholder: "Power / Network / USB" },
                { key: "location", label: "Location", placeholder: "e.g. Server Room" },
              ]}
            />
          )}
          {tab === "remoteManagement" && <RemoteManagementTab asset={asset} onUpdated={invalidate} />}
          {tab === "management" && <ManagementTab asset={asset} onUpdated={invalidate} />}
          {tab === "contracts" && (
            <FileResourceTab
              assetId={asset.id}
              resource="contracts"
              title="Contracts"
              subtitle="Vendor and service contracts associated with this asset."
              addLabel="Add Contract"
              fileOptional
              fields={[
                { key: "vendor", label: "Vendor", required: true, placeholder: "e.g. Dell ProSupport" },
                { key: "contractNumber", label: "Contract #", placeholder: "Optional" },
                { key: "startDate", label: "Start Date", type: "date" },
                { key: "endDate", label: "End Date", type: "date" },
                { key: "notes", label: "Notes", placeholder: "Optional" },
              ]}
              primaryField="vendor"
            />
          )}
          {tab === "documents" && (
            <FileResourceTab
              assetId={asset.id}
              resource="documents"
              title="Documents"
              subtitle="Manuals, receipts, and other files attached to this asset."
              addLabel="Upload Document"
              fields={[{ key: "name", label: "Document Name", required: true, placeholder: "e.g. User Manual" }]}
              primaryField="name"
            />
          )}
          {tab === "financialInfo" && <AssetFinancialTab asset={asset} onUpdated={invalidate} />}
          {tab === "virtualization" && <VirtualizationTab asset={asset} onUpdated={invalidate} />}
          {tab === "antivirus" && <AntivirusTab asset={asset} onUpdated={invalidate} />}
          {tab === "reports" && <ReportTab asset={asset} />}
          {tab === "logs" && <ActivityLogTab asset={asset} />}
        </div>
      </div>
    </div>
  );
}
