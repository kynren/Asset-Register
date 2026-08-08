import { useQuery } from "@tanstack/react-query";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { ScrollView, Text, TouchableOpacity, View } from "react-native";
import dayjs from "dayjs";
import { axiosClient } from "../../api/axiosClient";
import { useTheme } from "../../theme/ThemeContext";
import { ShimmerDetail } from "../../components/Shimmer";
import { Asset } from "../../types/asset";
import { AssetsStackParamList, MainTabParamList } from "../../navigation/types";
import { CompositeNavigationProp } from "@react-navigation/native";
import { BottomTabNavigationProp } from "@react-navigation/bottom-tabs";

type Nav = CompositeNavigationProp<NativeStackNavigationProp<AssetsStackParamList>, BottomTabNavigationProp<MainTabParamList>>;

// Mirrors client/src/pages/assets/detail/ImpactAnalysisTab.tsx — same client-side risk scoring
// derived from status, assignment, device connectivity, and open/urgent ticket counts.
export function AssetImpactAnalysisScreen() {
  const { colors, spacing, radius } = useTheme();
  const navigation = useNavigation<Nav>();
  const route = useRoute<RouteProp<AssetsStackParamList, "AssetImpactAnalysis">>();
  const { assetId } = route.params;

  const { data: asset, isLoading } = useQuery({ queryKey: ["mobile-asset", assetId], queryFn: async () => (await axiosClient.get(`/assets/${assetId}`)).data as Asset });

  if (isLoading || !asset) return <ShimmerDetail />;

  const tickets = asset.tickets ?? [];
  const openTickets = tickets.filter((t) => t.status === "OPEN" || t.status === "IN_PROGRESS");
  const urgentTickets = tickets.filter((t) => t.priority === "URGENT" && t.status !== "CLOSED" && t.status !== "RESOLVED");
  const isOnline = asset.device ? Date.now() - new Date(asset.device.lastSeen).getTime() < 15 * 60 * 1000 : null;

  const reasons: string[] = [];
  let risk: "LOW" | "MEDIUM" | "HIGH" = "LOW";
  if (asset.status === "IN_REPAIR" || asset.status === "LOST") { risk = "HIGH"; reasons.push(`Asset status is ${asset.status.replace("_", " ")}.`); }
  if (urgentTickets.length > 0) { risk = "HIGH"; reasons.push(`${urgentTickets.length} urgent ticket(s) currently open against this asset.`); }
  if (risk === "LOW" && openTickets.length > 0) { risk = "MEDIUM"; reasons.push(`${openTickets.length} open ticket(s) linked to this asset.`); }
  if (risk === "LOW" && asset.assignedTo && asset.status === "IN_USE") { risk = "MEDIUM"; reasons.push(`In active use and assigned to ${asset.assignedTo.firstName} ${asset.assignedTo.lastName} — downtime would directly affect them.`); }
  if (asset.device && isOnline === false) reasons.push("Linked device has not reported in over 15 minutes.");
  if (reasons.length === 0) reasons.push("No open tickets, and asset is currently unassigned or in storage.");

  const riskColor = risk === "HIGH" ? colors.danger : risk === "MEDIUM" ? colors.warning : colors.success;
  const cardStyle = { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.md };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}>
      <View style={cardStyle}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <Text style={{ color: colors.text, fontSize: 14, fontWeight: "700" }}>Risk Assessment</Text>
          <View style={{ backgroundColor: riskColor + "22", borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4 }}>
            <Text style={{ color: riskColor, fontSize: 11, fontWeight: "700" }}>{risk} IMPACT</Text>
          </View>
        </View>
        {reasons.map((r, i) => (
          <Text key={i} style={{ color: colors.textMuted, fontSize: 12.5, marginTop: 4 }}>• {r}</Text>
        ))}
      </View>

      <View style={cardStyle}>
        <Text style={{ color: colors.text, fontSize: 14, fontWeight: "700", marginBottom: 8 }}>Operational Dependency</Text>
        <Text style={{ color: colors.textMuted, fontSize: 12.5, marginTop: 2 }}>Assigned Operator: <Text style={{ color: colors.text, fontWeight: "600" }}>{asset.assignedTo ? `${asset.assignedTo.firstName} ${asset.assignedTo.lastName}` : "Unassigned"}</Text></Text>
        <Text style={{ color: colors.textMuted, fontSize: 12.5, marginTop: 4 }}>Device Connectivity: <Text style={{ color: colors.text, fontWeight: "600" }}>{asset.device ? (isOnline ? "Online" : "Offline") : "No device linked"}</Text></Text>
        <Text style={{ color: colors.textMuted, fontSize: 12.5, marginTop: 4 }}>Current Status: <Text style={{ color: colors.text, fontWeight: "600" }}>{asset.status.replace("_", " ")}</Text></Text>
      </View>

      <View style={cardStyle}>
        <Text style={{ color: colors.text, fontSize: 14, fontWeight: "700", marginBottom: 8 }}>Linked Tickets ({tickets.length})</Text>
        {tickets.length === 0 ? (
          <Text style={{ color: colors.textMuted, fontSize: 12.5 }}>No tickets have been raised for this asset.</Text>
        ) : (
          tickets.map((t) => (
            <TouchableOpacity key={t.id} style={{ paddingVertical: 8, borderTopWidth: 1, borderTopColor: colors.border }} onPress={() => navigation.navigate("HelpdeskTab", undefined)}>
              <Text style={{ color: colors.text, fontSize: 13, fontWeight: "600" }}>{t.ticketNumber} — {t.title}</Text>
              <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 2 }}>{t.status.replace("_", " ")} · {t.priority} · {dayjs(t.createdAt).format("DD MMM YYYY")}</Text>
            </TouchableOpacity>
          ))
        )}
      </View>
    </ScrollView>
  );
}
