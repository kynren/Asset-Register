import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import dayjs, { Dayjs } from "dayjs";
import { axiosClient } from "../../../api/axiosClient";
import { Icon } from "../../../components/Icon";

type ProjectStatus = "TODO" | "IN_PROGRESS" | "REVIEW" | "DONE";

interface ProjectCard {
  id: number;
  title: string;
  status: ProjectStatus;
  startDate: string | null;
  dueDate: string | null;
  createdAt: string;
  assignee: { id: number; firstName: string; lastName: string } | null;
}

interface Schedule {
  id: number;
  resourceName: string;
  groupLabel: string;
  title: string | null;
  color: string | null;
  startAt: string;
  endAt: string;
}

const DEFAULT_STATUS_COLORS: Record<ProjectStatus, string> = {
  TODO: "#64748b",
  IN_PROGRESS: "#2563eb",
  REVIEW: "#d97706",
  DONE: "#16a34a",
};

// Same idea as ResourceSchedulingTab's own PALETTE — cycles through the app's theme accent tokens
// rather than arbitrary hex so resource bars re-theme correctly in dark mode.
const RESOURCE_PALETTE = ["var(--color-primary)", "var(--color-success)", "var(--color-warning)", "var(--color-danger)"];
function colorForResource(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return RESOURCE_PALETTE[hash % RESOURCE_PALETTE.length];
}

const WINDOW_DAYS = 21;

export function TimelineTab() {
  const [windowStart, setWindowStart] = useState<Dayjs>(() => dayjs().startOf("day").subtract(3, "day"));
  const windowEnd = windowStart.add(WINDOW_DAYS - 1, "day");
  const today = dayjs().startOf("day");

  const { data: projects, isLoading: projectsLoading } = useQuery({
    queryKey: ["op-projects"],
    queryFn: async () => (await axiosClient.get("/operations/projects")).data as ProjectCard[],
  });
  const { data: schedules, isLoading: schedulesLoading } = useQuery({
    queryKey: ["op-scheduling"],
    queryFn: async () => (await axiosClient.get("/operations/scheduling")).data as Schedule[],
  });
  const { data: statusColors } = useQuery({
    queryKey: ["op-project-status-colors"],
    queryFn: async () => (await axiosClient.get("/operations/projects/status-colors")).data as Record<ProjectStatus, string>,
  });
  const colors = statusColors ?? DEFAULT_STATUS_COLORS;

  const days = useMemo(() => Array.from({ length: WINDOW_DAYS }, (_, i) => windowStart.add(i, "day")), [windowStart]);

  function barStyle(start: Dayjs, end: Dayjs) {
    const clampedStart = start.isBefore(windowStart) ? windowStart : start;
    const clampedEnd = end.isAfter(windowEnd) ? windowEnd : end;
    if (clampedEnd.isBefore(windowStart) || clampedStart.isAfter(windowEnd)) return null;
    const startIdx = clampedStart.diff(windowStart, "day");
    const endIdx = clampedEnd.diff(windowStart, "day");
    const left = (startIdx / WINDOW_DAYS) * 100;
    const width = Math.max(((endIdx - startIdx + 1) / WINDOW_DAYS) * 100, 100 / WINDOW_DAYS / 2);
    return { left: `${left}%`, width: `${width}%` };
  }

  const projectRows = useMemo(() => {
    return (projects ?? [])
      .filter((p) => p.startDate || p.dueDate)
      .map((p) => {
        const start = dayjs(p.startDate ?? p.dueDate ?? p.createdAt).startOf("day");
        const end = dayjs(p.dueDate ?? p.startDate ?? p.createdAt).startOf("day");
        return { project: p, start: start.isAfter(end) ? end : start, end: start.isAfter(end) ? start : end };
      })
      .filter((r) => !r.end.isBefore(windowStart) && !r.start.isAfter(windowEnd));
  }, [projects, windowStart, windowEnd]);

  const resourceRows = useMemo(() => {
    const byResource = new Map<string, Schedule[]>();
    for (const s of schedules ?? []) {
      const start = dayjs(s.startAt).startOf("day");
      const end = dayjs(s.endAt).startOf("day");
      if (end.isBefore(windowStart) || start.isAfter(windowEnd)) continue;
      if (!byResource.has(s.resourceName)) byResource.set(s.resourceName, []);
      byResource.get(s.resourceName)!.push(s);
    }
    return [...byResource.entries()];
  }, [schedules, windowStart, windowEnd]);

  const isLoading = projectsLoading || schedulesLoading;

  return (
    <div>
      <div className="card" style={{ padding: "18px 20px 20px" }}>
        <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12, marginBottom: 16 }}>
          <div>
            <div className="row gap-2" style={{ alignItems: "center" }}>
              <Icon name="sliders" size={16} style={{ color: "var(--color-primary)" }} />
              <strong style={{ fontSize: 13, letterSpacing: 1, color: "var(--color-primary)" }}>TIMELINE</strong>
            </div>
            <p className="muted" style={{ fontSize: 11.5, margin: "6px 0 0", maxWidth: 560 }}>
              A rolling {WINDOW_DAYS}-day view of IT Project start/due dates alongside Resource Scheduling blocks, so overlapping commitments are visible at a glance.
            </p>
          </div>
          <div className="row gap-2" style={{ alignItems: "center" }}>
            <button className="btn-icon" onClick={() => setWindowStart((d) => d.subtract(7, "day"))} title="Previous week">
              <Icon name="chevronLeft" size={14} />
            </button>
            <button className="btn btn-secondary btn-sm" onClick={() => setWindowStart(dayjs().startOf("day").subtract(3, "day"))} style={{ fontSize: 11 }}>
              {windowStart.format("DD MMM")} – {windowEnd.format("DD MMM YYYY")}
            </button>
            <button className="btn-icon" onClick={() => setWindowStart((d) => d.add(7, "day"))} title="Next week">
              <Icon name="chevronRight" size={14} />
            </button>
          </div>
        </div>

        {isLoading ? (
          <div className="muted" style={{ fontSize: 12, padding: "20px 0" }}>Loading timeline...</div>
        ) : projectRows.length === 0 && resourceRows.length === 0 ? (
          <div className="muted" style={{ fontSize: 12, padding: "20px 0", textAlign: "center" }}>
            Nothing scheduled in this window. IT Projects need a Start or Due Date to appear here.
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <div style={{ minWidth: 900 }}>
              <div style={{ display: "grid", gridTemplateColumns: "200px 1fr", gap: 0, marginBottom: 8 }}>
                <div />
                <div style={{ position: "relative", display: "grid", gridTemplateColumns: `repeat(${WINDOW_DAYS}, 1fr)` }}>
                  {days.map((d) => (
                    <div
                      key={d.format("YYYY-MM-DD")}
                      className="muted"
                      style={{
                        textAlign: "center",
                        fontSize: 9.5,
                        fontWeight: d.isSame(today, "day") ? 800 : 600,
                        color: d.isSame(today, "day") ? "var(--color-primary)" : undefined,
                        padding: "2px 0",
                        borderLeft: "1px solid var(--color-border)",
                      }}
                    >
                      {d.format("DD")}
                      <div style={{ fontSize: 8, opacity: 0.7 }}>{d.format("ddd")}</div>
                    </div>
                  ))}
                </div>
              </div>

              {projectRows.length > 0 && (
                <div style={{ margin: "10px 0 6px", fontSize: 10.5, fontWeight: 700, letterSpacing: 0.5, color: "var(--color-primary)" }}>IT PROJECTS</div>
              )}
              {projectRows.map(({ project, start, end }) => {
                const style = barStyle(start, end);
                return (
                  <div key={`p-${project.id}`} style={{ display: "grid", gridTemplateColumns: "200px 1fr", gap: 0, marginBottom: 6, alignItems: "center" }}>
                    <div style={{ fontSize: 12, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", paddingRight: 8 }} title={project.title}>
                      {project.title}
                    </div>
                    <div style={{ position: "relative", height: 22, background: "var(--color-bg)", borderRadius: 4 }}>
                      {style && (
                        <div
                          style={{
                            position: "absolute",
                            top: 2,
                            bottom: 2,
                            left: style.left,
                            width: style.width,
                            background: colors[project.status],
                            borderRadius: 4,
                            display: "flex",
                            alignItems: "center",
                            paddingLeft: 6,
                            overflow: "hidden",
                            boxShadow: "var(--shadow-sm)",
                          }}
                          title={`${project.title} — ${project.status.replace("_", " ")}`}
                        >
                          <span style={{ fontSize: 9.5, fontWeight: 700, color: "#fff", whiteSpace: "nowrap" }}>{project.status.replace("_", " ")}</span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}

              {resourceRows.length > 0 && (
                <div style={{ margin: "14px 0 6px", fontSize: 10.5, fontWeight: 700, letterSpacing: 0.5, color: "var(--color-primary)" }}>RESOURCE SCHEDULE</div>
              )}
              {resourceRows.map(([resourceName, bookings]) => (
                <div key={`r-${resourceName}`} style={{ display: "grid", gridTemplateColumns: "200px 1fr", gap: 0, marginBottom: 6, alignItems: "center" }}>
                  <div style={{ fontSize: 12, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", paddingRight: 8 }} title={resourceName}>
                    {resourceName}
                  </div>
                  <div style={{ position: "relative", height: 22, background: "var(--color-bg)", borderRadius: 4 }}>
                    {bookings.map((b) => {
                      const style = barStyle(dayjs(b.startAt).startOf("day"), dayjs(b.endAt).startOf("day"));
                      if (!style) return null;
                      return (
                        <div
                          key={b.id}
                          style={{
                            position: "absolute",
                            top: 2,
                            bottom: 2,
                            left: style.left,
                            width: style.width,
                            background: b.color ?? colorForResource(resourceName),
                            borderRadius: 4,
                            display: "flex",
                            alignItems: "center",
                            paddingLeft: 6,
                            overflow: "hidden",
                            boxShadow: "var(--shadow-sm)",
                          }}
                          title={`${b.title || "Shift"} — ${dayjs(b.startAt).format("DD MMM HH:mm")} to ${dayjs(b.endAt).format("HH:mm")}`}
                        >
                          <span style={{ fontSize: 9.5, fontWeight: 700, color: "#fff", whiteSpace: "nowrap" }}>{b.title || "Shift"}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
