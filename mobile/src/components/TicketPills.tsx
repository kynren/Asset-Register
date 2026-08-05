import { Text, View } from "react-native";
import { useTheme } from "../theme/ThemeContext";
import { TicketPriority, TicketStatus, TICKET_PRIORITY_OPTIONS, TICKET_STATUS_OPTIONS } from "../types/ticket";

const STATUS_TONE: Record<TicketStatus, "primary" | "warning" | "success" | "neutral"> = {
  OPEN: "primary",
  IN_PROGRESS: "warning",
  PENDING: "warning",
  RESOLVED: "success",
  CLOSED: "neutral",
};

const PRIORITY_TONE: Record<TicketPriority, "neutral" | "warning" | "danger"> = {
  LOW: "neutral",
  MEDIUM: "neutral",
  HIGH: "warning",
  URGENT: "danger",
};

function Pill({ label, tone }: { label: string; tone: "primary" | "success" | "warning" | "danger" | "neutral" }) {
  const { colors, radius } = useTheme();
  const color = tone === "primary" ? colors.primary : tone === "success" ? colors.success : tone === "warning" ? colors.warning : tone === "danger" ? colors.danger : colors.textMuted;
  return (
    <View style={{ backgroundColor: color + "22", borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 3, alignSelf: "flex-start" }}>
      <Text style={{ color, fontSize: 11, fontWeight: "700" }}>{label}</Text>
    </View>
  );
}

export function TicketStatusPill({ status }: { status: TicketStatus }) {
  const label = TICKET_STATUS_OPTIONS.find((s) => s.value === status)?.label ?? status;
  return <Pill label={label} tone={STATUS_TONE[status] ?? "neutral"} />;
}

export function TicketPriorityPill({ priority }: { priority: TicketPriority }) {
  const label = TICKET_PRIORITY_OPTIONS.find((p) => p.value === priority)?.label ?? priority;
  return <Pill label={label} tone={PRIORITY_TONE[priority] ?? "neutral"} />;
}
