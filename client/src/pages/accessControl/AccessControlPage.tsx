import { useState } from "react";
import { ZigbeeScaffoldTab } from "../../components/ZigbeeScaffoldTab";
import { DevicesDoorsTab } from "./DevicesDoorsTab";
import { DoorStatusTab } from "./DoorStatusTab";
import { PersonsTab } from "./PersonsTab";
import { AccessGroupTab } from "./AccessGroupTab";
import { CredentialsTab } from "./CredentialsTab";
import { AccessEventLogTab } from "./AccessEventLogTab";

const TABS = [
  { key: "doors", label: "Manage Doors" },
  { key: "devices", label: "Devices & Doors" },
  { key: "persons", label: "Persons" },
  { key: "groups", label: "Access Group" },
  { key: "credentials", label: "Credentials" },
  { key: "events", label: "Event Log" },
  { key: "zigbee", label: "ZigBee" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export function AccessControlPage() {
  const [tab, setTab] = useState<TabKey>("doors");

  return (
    <div className="stack gap-3">
      <div className="page-header-sticky">
        <div className="page-header-content">
          <div>
            <h1 className="page-title">Access Control</h1>
            <p className="page-subtitle">Door controllers, persons, access groups, remote door control, credentials, and the access event log — over Hikvision ISAPI.</p>
          </div>
        </div>

        <div className="row gap-2 flex-wrap">
          {TABS.map((t) => (
            <button key={t.key} className={`btn btn-sm ${tab === t.key ? "btn-primary" : "btn-secondary"}`} onClick={() => setTab(t.key)}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {tab === "doors" && <DoorStatusTab />}
      {tab === "devices" && <DevicesDoorsTab />}
      {tab === "persons" && <PersonsTab />}
      {tab === "groups" && <AccessGroupTab />}
      {tab === "credentials" && <CredentialsTab />}
      {tab === "events" && <AccessEventLogTab />}
      {tab === "zigbee" && <ZigbeeScaffoldTab apiBase="/access-control" module="access-control" />}
    </div>
  );
}
