import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRoute, RouteProp } from "@react-navigation/native";
import { ActivityIndicator, ScrollView, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import dayjs from "dayjs";
import { axiosClient } from "../../api/axiosClient";
import { useTheme } from "../../theme/ThemeContext";
import { ShimmerDetail } from "../../components/Shimmer";
import { downloadAndShare } from "../../lib/downloadFile";
import { Asset } from "../../types/asset";
import { AssetsStackParamList } from "../../navigation/types";

interface ReportCheckout { id: number; checkedOutAt: string; checkedInAt: string | null; checkedOutTo: { firstName: string; lastName: string } }
interface ReportLicenseAssignment { id: number; assignedAt: string; license: { id: number; name: string; vendor: string | null } }
interface ReportActivity { id: number; action: string; createdAt: string; user: { firstName: string; lastName: string } | null }
interface ReportResponse {
  asset: Asset & { checkouts: ReportCheckout[]; licenseAssignments: ReportLicenseAssignment[]; _count: Record<string, number> };
  recentActivity: ReportActivity[];
}

function fmt(d: string | null) { return d ? dayjs(d).format("DD MMM YYYY") : "—"; }

// Mirrors client/src/pages/assets/detail/ReportTab.tsx — a consolidated, exportable summary of
// this asset's identity, lifecycle, and usage, plus the same PDF export.
export function AssetReportScreen() {
  const { colors, spacing, radius } = useTheme();
  const route = useRoute<RouteProp<AssetsStackParamList, "AssetReport">>();
  const { assetId } = route.params;
  const [downloading, setDownloading] = useState(false);

  const { data, isLoading } = useQuery({ queryKey: ["mobile-asset-report", assetId], queryFn: async () => (await axiosClient.get(`/assets/${assetId}/report`)).data as ReportResponse });

  async function downloadPdf() {
    setDownloading(true);
    try {
      await downloadAndShare(`/assets/${assetId}/report/pdf`, `asset-${data?.asset.assetTag ?? assetId}-report.pdf`);
    } finally {
      setDownloading(false);
    }
  }

  if (isLoading || !data) return <ShimmerDetail />;

  const { asset: full, recentActivity } = data;
  const c = full._count;
  const activeCheckout = full.checkouts.find((c2) => !c2.checkedInAt);
  const cardStyle = { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.md };
  const rowLabel = { color: colors.textMuted, fontSize: 12 };
  const rowValue = { color: colors.text, fontSize: 13, fontWeight: "600" as const };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}>
      <TouchableOpacity style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: colors.primary, borderRadius: radius.md, paddingVertical: 12 }} disabled={downloading} onPress={downloadPdf}>
        {downloading ? <ActivityIndicator color="#fff" /> : <Ionicons name="download-outline" size={16} color="#fff" />}
        <Text style={{ color: "#fff", fontWeight: "700", fontSize: 13 }}>Download PDF Report</Text>
      </TouchableOpacity>

      <View style={cardStyle}>
        <Text style={{ color: colors.text, fontSize: 14, fontWeight: "700", marginBottom: 8 }}>Overview</Text>
        <Text style={rowLabel}>Category</Text><Text style={[rowValue, { marginBottom: 6 }]}>{full.category?.name ?? "Uncategorized"}</Text>
        <Text style={rowLabel}>Status</Text><Text style={[rowValue, { marginBottom: 6 }]}>{full.status.replace("_", " ")} · {full.signOffStatus}</Text>
        <Text style={rowLabel}>Location</Text><Text style={[rowValue, { marginBottom: 6 }]}>{full.location?.name ?? "—"}</Text>
        <Text style={rowLabel}>Manufacturer / Model</Text><Text style={rowValue}>{full.manufacturer ?? "—"} / {full.model ?? "—"}</Text>
      </View>

      <View style={cardStyle}>
        <Text style={{ color: colors.text, fontSize: 14, fontWeight: "700", marginBottom: 8 }}>Financial &amp; Warranty</Text>
        <Text style={rowLabel}>Purchase Date</Text><Text style={[rowValue, { marginBottom: 6 }]}>{fmt(full.purchaseDate)}</Text>
        <Text style={rowLabel}>Purchase Cost</Text><Text style={[rowValue, { marginBottom: 6 }]}>{full.purchaseCost ?? "—"}</Text>
        <Text style={rowLabel}>Warranty Expires</Text><Text style={[rowValue, { marginBottom: 6 }]}>{fmt(full.warrantyExpiresAt)}</Text>
        <Text style={rowLabel}>Next Service Date</Text><Text style={rowValue}>{fmt(full.nextServiceDate)}</Text>
      </View>

      <View style={cardStyle}>
        <Text style={{ color: colors.text, fontSize: 14, fontWeight: "700", marginBottom: 8 }}>Sub-Resource Summary</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
          {Object.entries(c).map(([label, value]) => (
            <View key={label} style={{ minWidth: 90 }}>
              <Text style={rowLabel}>{label}</Text>
              <Text style={{ color: colors.text, fontSize: 18, fontWeight: "800" }}>{value}</Text>
            </View>
          ))}
        </View>
      </View>

      <View style={cardStyle}>
        <Text style={{ color: colors.text, fontSize: 14, fontWeight: "700", marginBottom: 8 }}>Custody &amp; Checkout</Text>
        <Text style={rowLabel}>Current Custodian</Text>
        <Text style={[rowValue, { marginBottom: 6 }]}>{activeCheckout ? `${activeCheckout.checkedOutTo.firstName} ${activeCheckout.checkedOutTo.lastName}` : (full.assignedTo ? `${full.assignedTo.firstName} ${full.assignedTo.lastName}` : "Unassigned")}</Text>
        <Text style={rowLabel}>Total Checkouts on Record</Text><Text style={rowValue}>{full.checkouts.length}</Text>
      </View>

      {full.licenseAssignments.length > 0 && (
        <View style={cardStyle}>
          <Text style={{ color: colors.text, fontSize: 14, fontWeight: "700", marginBottom: 8 }}>Licenses Assigned</Text>
          {full.licenseAssignments.map((la) => (
            <View key={la.id} style={{ marginBottom: 6 }}>
              <Text style={rowValue}>{la.license.name}</Text>
              <Text style={rowLabel}>{la.license.vendor ?? "License"} · Since {fmt(la.assignedAt)}</Text>
            </View>
          ))}
        </View>
      )}

      <View style={cardStyle}>
        <Text style={{ color: colors.text, fontSize: 14, fontWeight: "700", marginBottom: 8 }}>Recent Activity</Text>
        {recentActivity.length === 0 ? (
          <Text style={{ color: colors.textMuted, fontSize: 12.5 }}>No activity recorded yet.</Text>
        ) : (
          recentActivity.slice(0, 8).map((a) => (
            <View key={a.id} style={{ marginBottom: 6 }}>
              <Text style={rowValue}>{a.action}</Text>
              <Text style={rowLabel}>{a.user ? `${a.user.firstName} ${a.user.lastName}` : "System"} · {dayjs(a.createdAt).format("DD MMM YYYY, HH:mm")}</Text>
            </View>
          ))
        )}
      </View>
    </ScrollView>
  );
}
