import { useQuery } from "@tanstack/react-query";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { ScrollView, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { axiosClient } from "../../api/axiosClient";
import { useTheme } from "../../theme/ThemeContext";
import { ShimmerList } from "../../components/Shimmer";
import { Asset } from "../../types/asset";
import { AssetsStackParamList } from "../../navigation/types";

interface ExplorerItem { key: string; label: string; icon: keyof typeof Ionicons.glyphMap; go: (nav: NativeStackNavigationProp<AssetsStackParamList>, assetId: number) => void }

const LEAD_ITEMS: ExplorerItem[] = [
  { key: "impact", label: "Impact Analysis", icon: "pulse-outline", go: (nav, assetId) => nav.navigate("AssetImpactAnalysis", { assetId }) },
  { key: "history", label: "Location History & Log", icon: "map-outline", go: (nav, assetId) => nav.navigate("AssetHistory", { assetId }) },
];

const COMPUTER_ITEMS: ExplorerItem[] = [
  { key: "components", label: "Components", icon: "hardware-chip-outline", go: (nav, assetId) => nav.navigate("AssetSubResource", { assetId, kind: "components" }) },
  { key: "volumes", label: "Volumes", icon: "server-outline", go: (nav, assetId) => nav.navigate("AssetSubResource", { assetId, kind: "volumes" }) },
  { key: "software", label: "Software", icon: "code-slash-outline", go: (nav, assetId) => nav.navigate("AssetSoftware", { assetId }) },
  { key: "connections", label: "Connections", icon: "link-outline", go: (nav, assetId) => nav.navigate("AssetSubResource", { assetId, kind: "connections" }) },
  { key: "network-ports", label: "Network Ports", icon: "swap-horizontal-outline", go: (nav, assetId) => nav.navigate("AssetSubResource", { assetId, kind: "network-ports" }) },
  { key: "sockets", label: "Sockets", icon: "flash-outline", go: (nav, assetId) => nav.navigate("AssetSubResource", { assetId, kind: "sockets" }) },
];

const MID_ITEMS: ExplorerItem[] = [
  { key: "management", label: "Management & Financials", icon: "briefcase-outline", go: (nav, assetId) => nav.navigate("AssetManagement", { assetId }) },
  { key: "contracts", label: "Contracts", icon: "document-text-outline", go: (nav, assetId) => nav.navigate("AssetFileResource", { assetId, kind: "contracts" }) },
  { key: "documents", label: "Documents", icon: "folder-outline", go: (nav, assetId) => nav.navigate("AssetFileResource", { assetId, kind: "documents" }) },
];

const COMPUTER_LATE_ITEMS: ExplorerItem[] = [
  { key: "techconfig", label: "Technical Configuration", icon: "settings-outline", go: (nav, assetId) => nav.navigate("AssetTechConfig", { assetId }) },
];

const TAIL_ITEMS: ExplorerItem[] = [
  { key: "reports", label: "Asset Report", icon: "bar-chart-outline", go: (nav, assetId) => nav.navigate("AssetReport", { assetId }) },
];

// Mirrors AssetDetailPage.tsx's sidebar nav — mobile has no left-rail sidebar, so this hub screen
// (reached from a button on AssetDetailScreen) becomes the equivalent "Asset Explorer" entry
// point. isComputerAsset gates the IT-specific sections exactly as buildNavItems() does; the
// per-category Capacities toggles for Components/Contracts/Documents/Financial Info are not
// ported (same simplification as elsewhere this session for fine-grained admin customization
// with no mobile precedent) — those sections always show, matching the pre-Capacities fallback.
export function AssetExplorerScreen() {
  const { colors, spacing, radius } = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<AssetsStackParamList>>();
  const route = useRoute<RouteProp<AssetsStackParamList, "AssetExplorer">>();
  const { assetId } = route.params;

  const { data: asset, isLoading } = useQuery({ queryKey: ["mobile-asset", assetId], queryFn: async () => (await axiosClient.get(`/assets/${assetId}`)).data as Asset });

  if (isLoading || !asset) return <ShimmerList />;

  const isComputerAsset = asset.category?.isComputerAsset ?? false;
  const items = [...LEAD_ITEMS, ...(isComputerAsset ? COMPUTER_ITEMS : []), ...MID_ITEMS, ...(isComputerAsset ? COMPUTER_LATE_ITEMS : []), ...TAIL_ITEMS];

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm }}>
      {items.map((item) => (
        <TouchableOpacity
          key={item.key}
          style={{ flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md, borderWidth: 1, borderColor: colors.border }}
          onPress={() => item.go(navigation, assetId)}
        >
          <Ionicons name={item.icon} size={20} color={colors.primary} />
          <Text style={{ color: colors.text, fontSize: 14, fontWeight: "700", flex: 1 }}>{item.label}</Text>
          <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}
