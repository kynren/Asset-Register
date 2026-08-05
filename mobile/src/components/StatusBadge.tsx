import { Text, View } from "react-native";
import { useTheme } from "../theme/ThemeContext";
import { AssetStatus } from "../types/asset";

const TONE: Record<AssetStatus, "success" | "neutral" | "warning" | "danger"> = {
  IN_USE: "success",
  IN_STORAGE: "neutral",
  IN_REPAIR: "warning",
  RETIRED: "danger",
  LOST: "danger",
};

const LABEL: Record<AssetStatus, string> = {
  IN_USE: "In Use",
  IN_STORAGE: "In Storage",
  IN_REPAIR: "In Repair",
  RETIRED: "Retired",
  LOST: "Lost",
};

export function StatusBadge({ status }: { status: AssetStatus }) {
  const { colors, radius } = useTheme();
  const tone = TONE[status] ?? "neutral";
  const color = tone === "success" ? colors.success : tone === "warning" ? colors.warning : tone === "danger" ? colors.danger : colors.textMuted;

  return (
    <View style={{ backgroundColor: color + "22", borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 3, alignSelf: "flex-start" }}>
      <Text style={{ color, fontSize: 11, fontWeight: "700" }}>{LABEL[status] ?? status}</Text>
    </View>
  );
}
