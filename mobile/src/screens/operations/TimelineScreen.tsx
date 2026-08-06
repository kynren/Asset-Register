import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ScrollView, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import dayjs, { Dayjs } from "dayjs";
import { axiosClient } from "../../api/axiosClient";
import { useTheme } from "../../theme/ThemeContext";
import { ShimmerList } from "../../components/Shimmer";

type ProjectStatus = "TODO" | "IN_PROGRESS" | "REVIEW" | "DONE";
interface ProjectCard {
  id: number;
  title: string;
  status: ProjectStatus;
  startDate: string | null;
  dueDate: string | null;
  createdAt: string;
}
interface Schedule {
  id: number;
  resourceName: string;
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
const WINDOW_DAYS = 14;
const DAY_WIDTH = 40;
const LABEL_WIDTH = 130;

export function TimelineScreen() {
  const { colors, spacing, radius } = useTheme();
  const [windowStart, setWindowStart] = useState<Dayjs>(() => dayjs().startOf("day").subtract(2, "day"));
  const windowEnd = windowStart.add(WINDOW_DAYS - 1, "day");
  const today = dayjs().startOf("day");

  const { data: projects, isLoading: projectsLoading } = useQuery({
    queryKey: ["mobile-timeline-projects"],
    queryFn: async () => (await axiosClient.get("/operations/projects")).data as ProjectCard[],
  });
  const { data: schedules, isLoading: schedulesLoading } = useQuery({
    queryKey: ["mobile-scheduling"],
    queryFn: async () => (await axiosClient.get("/operations/scheduling")).data as Schedule[],
  });
  const { data: statusColors } = useQuery({
    queryKey: ["mobile-project-status-colors"],
    queryFn: async () => (await axiosClient.get("/operations/projects/status-colors")).data as Record<ProjectStatus, string>,
  });
  const colorsByStatus = statusColors ?? DEFAULT_STATUS_COLORS;

  const days = useMemo(() => Array.from({ length: WINDOW_DAYS }, (_, i) => windowStart.add(i, "day")), [windowStart]);

  function barLayout(start: Dayjs, end: Dayjs) {
    const clampedStart = start.isBefore(windowStart) ? windowStart : start;
    const clampedEnd = end.isAfter(windowEnd) ? windowEnd : end;
    if (clampedEnd.isBefore(windowStart) || clampedStart.isAfter(windowEnd)) return null;
    const startIdx = clampedStart.diff(windowStart, "day");
    const endIdx = clampedEnd.diff(windowStart, "day");
    return { left: startIdx * DAY_WIDTH, width: Math.max((endIdx - startIdx + 1) * DAY_WIDTH - 4, DAY_WIDTH / 2) };
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
  const trackWidth = WINDOW_DAYS * DAY_WIDTH;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: spacing.lg, paddingBottom: spacing.sm }}>
        <TouchableOpacity onPress={() => setWindowStart((d) => d.subtract(7, "day"))} style={{ padding: 6 }}>
          <Ionicons name="chevron-back" size={20} color={colors.text} />
        </TouchableOpacity>
        <Text style={{ color: colors.text, fontSize: 13, fontWeight: "700" }}>{windowStart.format("DD MMM")} – {windowEnd.format("DD MMM YYYY")}</Text>
        <TouchableOpacity onPress={() => setWindowStart((d) => d.add(7, "day"))} style={{ padding: 6 }}>
          <Ionicons name="chevron-forward" size={20} color={colors.text} />
        </TouchableOpacity>
      </View>

      {isLoading ? (
        <ShimmerList />
      ) : projectRows.length === 0 && resourceRows.length === 0 ? (
        <Text style={{ color: colors.textMuted, textAlign: "center", marginTop: 24, paddingHorizontal: spacing.lg }}>
          Nothing scheduled in this window.
        </Text>
      ) : (
        <ScrollView horizontal style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: spacing.lg }}>
          <View style={{ paddingHorizontal: spacing.lg }}>
            <View style={{ flexDirection: "row", marginLeft: LABEL_WIDTH, marginBottom: 6 }}>
              {days.map((d) => (
                <View key={d.format("YYYY-MM-DD")} style={{ width: DAY_WIDTH, alignItems: "center", borderLeftWidth: 1, borderLeftColor: colors.border }}>
                  <Text style={{ fontSize: 9.5, fontWeight: d.isSame(today, "day") ? "800" : "600", color: d.isSame(today, "day") ? colors.primary : colors.textMuted }}>{d.format("DD")}</Text>
                  <Text style={{ fontSize: 8, color: colors.textMuted, opacity: 0.7 }}>{d.format("ddd")}</Text>
                </View>
              ))}
            </View>

            {projectRows.length > 0 && (
              <Text style={{ fontSize: 10.5, fontWeight: "700", letterSpacing: 0.5, color: colors.primary, marginVertical: 6 }}>IT PROJECTS</Text>
            )}
            {projectRows.map(({ project, start, end }) => {
              const layout = barLayout(start, end);
              return (
                <View key={`p-${project.id}`} style={{ flexDirection: "row", alignItems: "center", marginBottom: 8, height: 24 }}>
                  <Text style={{ width: LABEL_WIDTH, fontSize: 11.5, fontWeight: "600", color: colors.text }} numberOfLines={1}>{project.title}</Text>
                  <View style={{ width: trackWidth, height: 22, backgroundColor: colors.bg, borderRadius: 4 }}>
                    {layout && (
                      <View style={{ position: "absolute", left: layout.left, width: layout.width, height: 22, backgroundColor: colorsByStatus[project.status], borderRadius: 4, justifyContent: "center", paddingLeft: 5 }}>
                        <Text style={{ fontSize: 8.5, fontWeight: "700", color: "#fff" }} numberOfLines={1}>{project.status.replace("_", " ")}</Text>
                      </View>
                    )}
                  </View>
                </View>
              );
            })}

            {resourceRows.length > 0 && (
              <Text style={{ fontSize: 10.5, fontWeight: "700", letterSpacing: 0.5, color: colors.primary, marginTop: 10, marginBottom: 6 }}>RESOURCE SCHEDULE</Text>
            )}
            {resourceRows.map(([resourceName, bookings]) => (
              <View key={`r-${resourceName}`} style={{ flexDirection: "row", alignItems: "center", marginBottom: 8, height: 24 }}>
                <Text style={{ width: LABEL_WIDTH, fontSize: 11.5, fontWeight: "600", color: colors.text }} numberOfLines={1}>{resourceName}</Text>
                <View style={{ width: trackWidth, height: 22, backgroundColor: colors.bg, borderRadius: 4 }}>
                  {bookings.map((b) => {
                    const layout = barLayout(dayjs(b.startAt).startOf("day"), dayjs(b.endAt).startOf("day"));
                    if (!layout) return null;
                    return (
                      <View key={b.id} style={{ position: "absolute", left: layout.left, width: layout.width, height: 22, backgroundColor: b.color ?? colors.primary, borderRadius: 4, justifyContent: "center", paddingLeft: 5 }}>
                        <Text style={{ fontSize: 8.5, fontWeight: "700", color: "#fff" }} numberOfLines={1}>{b.title || "Shift"}</Text>
                      </View>
                    );
                  })}
                </View>
              </View>
            ))}
          </View>
        </ScrollView>
      )}
    </View>
  );
}
