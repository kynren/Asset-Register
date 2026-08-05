import { Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../theme/ThemeContext";

// Placeholder for modules not yet ported to the mobile app — see mobile/README.md's "Module
// coverage" table for the full build order. Each of these gets replaced by a real, API-wired
// screen as its task comes up; this is never meant to ship as-is.
export function ComingSoonScreen({ route }: any) {
  const { colors, spacing } = useTheme();
  const label = route?.params?.label ?? "This module";
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg, padding: spacing.xl }}>
      <Ionicons name="construct-outline" size={40} color={colors.textMuted} />
      <Text style={{ color: colors.text, fontSize: 16, fontWeight: "700", marginTop: spacing.md }}>{label}</Text>
      <Text style={{ color: colors.textMuted, fontSize: 13, marginTop: 4, textAlign: "center" }}>
        Not yet ported to mobile — available in the web app for now.
      </Text>
    </View>
  );
}
