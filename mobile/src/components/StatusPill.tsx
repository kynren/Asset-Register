import { Text, View } from "react-native";
import { useTheme } from "../theme/ThemeContext";

const TONE_BY_VALUE: Record<string, "primary" | "success" | "warning" | "danger" | "neutral"> = {
  TODO: "neutral",
  DONE: "success",
  WAITING: "warning",
  ACCEPTED: "success",
  REFUSED: "danger",
};

// Generic small status chip for arbitrary enum-like strings (task state, solution/approval
// status, etc.) — TicketPills.tsx covers only ticket status/priority, this covers everything else
// across the GLPI-parity tabs without hardcoding a label map per screen.
export function StatusPill({ value }: { value: string }) {
  const { colors, radius } = useTheme();
  const tone = TONE_BY_VALUE[value] ?? "neutral";
  const color = tone === "primary" ? colors.primary : tone === "success" ? colors.success : tone === "warning" ? colors.warning : tone === "danger" ? colors.danger : colors.textMuted;
  const label = value.charAt(0) + value.slice(1).toLowerCase().replace(/_/g, " ");
  return (
    <View style={{ backgroundColor: color + "22", borderRadius: radius.pill, paddingHorizontal: 9, paddingVertical: 2, alignSelf: "flex-start" }}>
      <Text style={{ color, fontSize: 10.5, fontWeight: "700" }}>{label}</Text>
    </View>
  );
}
