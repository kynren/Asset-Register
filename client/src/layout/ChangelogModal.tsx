import { useQuery } from "@tanstack/react-query";
import { axiosClient } from "../api/axiosClient";
import { useUserPreference } from "../hooks/useUserPreference";
import { Icon } from "../components/Icon";

interface ChangelogEntry {
  id: number;
  title: string;
  summary: string | null;
  items: string[];
  publishedAt: string;
  createdBy: { id: number; firstName: string; lastName: string } | null;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

// Shown once per user, the first time they load the app after a new entry is published — see
// changelog.routes.ts's GET /unseen (server-side diff against the "changelog.lastSeenId"
// preference) and the mount point in AppShell.tsx. Dismissing advances that preference to the
// newest entry shown, so it never reappears for the same entries.
export function ChangelogModal() {
  const { data: entries } = useQuery({
    queryKey: ["changelog-unseen"],
    queryFn: async () => (await axiosClient.get("/changelog/unseen")).data as ChangelogEntry[],
    staleTime: Infinity,
  });
  const { setValue: setLastSeenId } = useUserPreference<number>("changelog.lastSeenId", 0);

  if (!entries || entries.length === 0) return null;

  const newestFirst = [...entries].reverse();

  function dismiss() {
    const maxId = Math.max(...entries!.map((e) => e.id));
    setLastSeenId(maxId);
  }

  return (
    <div className="modal-overlay" onClick={dismiss}>
      <div className="modal" style={{ maxWidth: 560, padding: 0, overflow: "hidden" }} onClick={(e) => e.stopPropagation()}>
        <div
          style={{
            background: "linear-gradient(135deg, var(--color-accent, #4f46e5), #7c3aed)",
            padding: "28px 28px 22px",
            color: "#fff",
            position: "relative",
          }}
        >
          <button
            className="modal-close"
            onClick={dismiss}
            style={{ position: "absolute", top: 14, right: 14, color: "#fff" }}
          >
            <Icon name="close" size={18} />
          </button>
          <div className="row gap-2" style={{ alignItems: "center" }}>
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: 10,
                background: "rgba(255,255,255,0.18)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Icon name="star" size={20} />
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: 20 }}>What's New</h2>
              <p style={{ margin: 0, opacity: 0.85, fontSize: 13 }}>
                {entries.length === 1 ? "1 update" : `${entries.length} updates`} since you last checked in
              </p>
            </div>
          </div>
        </div>

        <div className="stack gap-3" style={{ padding: 24, maxHeight: "55vh", overflowY: "auto" }}>
          {newestFirst.map((entry) => (
            <div key={entry.id} style={{ borderBottom: "1px solid var(--color-border)", paddingBottom: 16 }}>
              <div className="row gap-2" style={{ alignItems: "baseline", justifyContent: "space-between" }}>
                <strong style={{ fontSize: 15 }}>{entry.title}</strong>
                <span className="muted" style={{ fontSize: 12, whiteSpace: "nowrap" }}>{formatDate(entry.publishedAt)}</span>
              </div>
              {entry.summary && <p className="muted" style={{ fontSize: 13, margin: "4px 0 8px" }}>{entry.summary}</p>}
              {entry.items.length > 0 && (
                <ul style={{ margin: 0, padding: 0, listStyle: "none" }} className="stack gap-1">
                  {entry.items.map((item, i) => (
                    <li key={i} className="row gap-2" style={{ alignItems: "flex-start", fontSize: 13 }}>
                      <span style={{ color: "var(--color-success, #16a34a)", marginTop: 2, flexShrink: 0 }}>
                        <Icon name="check" size={13} />
                      </span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>

        <div className="modal-footer">
          <button className="btn btn-primary" style={{ width: "100%" }} onClick={dismiss}>
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}
