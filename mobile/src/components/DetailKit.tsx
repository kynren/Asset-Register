import { Text, View } from "react-native";

// Shared building blocks for detail-style screens (asset/stock/etc.) — a labeled section wrapper
// and a bordered label/value row list. Extracted from AssetDetailScreen.tsx so the new Asset
// Explorer sub-screens (#718) can reuse the exact same look without duplicating styles.
export function Section({ title, colors, spacing, children }: { title: string; colors: any; spacing: any; children: React.ReactNode }) {
  return (
    <View style={{ marginTop: spacing.lg }}>
      <Text style={{ color: colors.textMuted, fontSize: 12, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.3, marginBottom: 8 }}>{title}</Text>
      {children}
    </View>
  );
}

export function RowList({ rows, colors }: { rows: [string, string][]; colors: any }) {
  return (
    <View style={{ backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 16 }}>
      {rows.map(([label, value], i) => (
        <View key={label} style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 12, borderBottomWidth: i < rows.length - 1 ? 1 : 0, borderBottomColor: colors.border }}>
          <Text style={{ color: colors.textMuted, fontSize: 13 }}>{label}</Text>
          <Text style={{ color: colors.text, fontSize: 13, fontWeight: "600", flexShrink: 1, textAlign: "right", marginLeft: 12 }}>{value}</Text>
        </View>
      ))}
    </View>
  );
}
