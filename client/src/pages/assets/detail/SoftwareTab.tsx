import { useState } from "react";
import { Icon } from "../../../components/Icon";
import { AssetDetail } from "./types";

export function SoftwareTab({ asset }: { asset: AssetDetail }) {
  const [search, setSearch] = useState("");
  const software = asset.device?.installedSoftware ?? [];
  const filtered = software.filter((s) => s.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div>
      <div className="ad-content-header">
        <h2 className="ad-content-title"><Icon name="code" size={16} /> Software</h2>
        <p className="ad-content-subtitle">Applications installed on this asset, as reported by the Kynren agent.</p>
      </div>

      <div className="ad-panel">
        {!asset.device ? (
          <div className="ad-empty">No device linked to this asset, so no installed software has been reported.</div>
        ) : software.length === 0 ? (
          <div className="ad-empty">The agent has not reported any installed software for this device yet.</div>
        ) : (
          <>
            <input
              className="ad-input"
              style={{ marginBottom: 14, maxWidth: 320 }}
              placeholder="Search installed software..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <table className="ad-table">
              <thead><tr><th>Name</th><th>Version</th></tr></thead>
              <tbody>
                {filtered.map((s, i) => (
                  <tr key={i}>
                    <td>{s.name}</td>
                    <td>{s.version ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filtered.length === 0 && <div className="ad-empty">No software matches "{search}".</div>}
          </>
        )}
      </div>
    </div>
  );
}
