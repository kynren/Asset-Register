import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { ScrollView, Text, TouchableOpacity, View } from "react-native";
import { useTheme } from "../../theme/ThemeContext";
import { MoreStackParamList } from "../../navigation/types";

// Landing screen for all 9 tabs of the web app's OperationsPage, ported to mobile.
const ITEMS: { key: string; label: string; description: string; icon: keyof typeof Ionicons.glyphMap; route: keyof MoreStackParamList }[] = [
  { key: "projects", label: "IT Projects", description: "Board of work items by status", icon: "list-outline", route: "ProjectList" },
  { key: "knowledge", label: "Knowledge Base", description: "Search internal articles", icon: "book-outline", route: "KnowledgeList" },
  { key: "bookings", label: "Asset Bookings", description: "See and reserve booked assets", icon: "calendar-outline", route: "BookingList" },
  { key: "rss", label: "RSS Feed", description: "Headlines from configured feed sources", icon: "newspaper-outline", route: "RssFeed" },
  { key: "saved-queries", label: "Saved Queries", description: "Bookmarked filter/search combinations", icon: "bookmark-outline", route: "SavedQueries" },
  { key: "scheduling", label: "Resource Scheduling", description: "Technician & crew shift blocks", icon: "time-outline", route: "ResourceScheduling" },
  { key: "licenses", label: "Licenses", description: "Software licenses and seat assignments", icon: "key-outline", route: "LicenseList" },
  { key: "timeline", label: "Timeline", description: "Projects and shifts on a shared calendar", icon: "stats-chart-outline", route: "Timeline" },
  { key: "legacy", label: "Legacy Tools", description: "Bulk status update, reports, maintenance alerts", icon: "construct-outline", route: "LegacyTools" },
];

export function OperationsHomeScreen() {
  const { colors, spacing, radius } = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<MoreStackParamList>>();

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm }}>
      {ITEMS.map((item) => (
        <TouchableOpacity
          key={item.key}
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: spacing.md,
            backgroundColor: colors.surface,
            borderRadius: radius.md,
            padding: spacing.md,
            borderWidth: 1,
            borderColor: colors.border,
          }}
          onPress={() => navigation.navigate(item.route as any)}
        >
          <Ionicons name={item.icon} size={20} color={colors.primary} />
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.text, fontSize: 14, fontWeight: "700" }}>{item.label}</Text>
            <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 1 }}>{item.description}</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}
