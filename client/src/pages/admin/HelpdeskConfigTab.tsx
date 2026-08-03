import { useState } from "react";
import { TicketTemplatesTab } from "./TicketTemplatesTab";
import { TicketSlasTab } from "./TicketSlasTab";
import { TicketRecurrencesTab } from "./TicketRecurrencesTab";
import { TicketRulesTab } from "./TicketRulesTab";
import { HelpdeskSettingsTab } from "./HelpdeskSettingsTab";

const SUB_TABS = [
  { key: "templates", label: "Templates" },
  { key: "slas", label: "SLAs" },
  { key: "recurrences", label: "Recurring Tickets" },
  { key: "rules", label: "Business Rules" },
  { key: "settings", label: "Settings" },
] as const;

type SubTabKey = (typeof SUB_TABS)[number]["key"];

export function HelpdeskConfigTab() {
  const [sub, setSub] = useState<SubTabKey>("templates");

  return (
    <div className="stack gap-3">
      <div className="row gap-1 flex-wrap">
        {SUB_TABS.map((t) => (
          <button key={t.key} className={`btn btn-sm ${sub === t.key ? "btn-primary" : "btn-secondary"}`} onClick={() => setSub(t.key)}>
            {t.label}
          </button>
        ))}
      </div>
      {sub === "templates" && <TicketTemplatesTab />}
      {sub === "slas" && <TicketSlasTab />}
      {sub === "recurrences" && <TicketRecurrencesTab />}
      {sub === "rules" && <TicketRulesTab />}
      {sub === "settings" && <HelpdeskSettingsTab />}
    </div>
  );
}
