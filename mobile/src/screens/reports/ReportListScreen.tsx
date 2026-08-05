import { useQuery } from "@tanstack/react-query";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { ActivityIndicator, FlatList, RefreshControl, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { axiosClient } from "../../api/axiosClient";
import { useTheme } from "../../theme/ThemeContext";
import { useAuth } from "../../auth/AuthContext";
import { ReportSummary } from "../../types/reports";
import { MoreStackParamList } from "../../navigation/types";

export function ReportListScreen() {
  const { colors, spacing, radius } = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<MoreStackParamList>>();
  const { hasPermission } = useAuth();
  const canCreate = hasPermission("reports", "create");

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ["mobile-reports"],
    queryFn: async () => (await axiosClient.get("/reports")).data as ReportSummary[],
  });

  const reports = data ?? [];

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      {canCreate && (
        <TouchableOpacity
          style={{ position: "absolute", right: spacing.lg, bottom: spacing.lg, zIndex: 1, backgroundColor: colors.primary, borderRadius: 28, width: 56, height: 56, alignItems: "center", justifyContent: "center", elevation: 4 }}
          onPress={() => navigation.navigate("ReportBuilder", undefined)}
        >
          <Ionicons name="add" size={26} color="#fff" />
        </TouchableOpacity>
      )}
      {isLoading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />
      ) : (
        <FlatList
          data={reports}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm }}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.primary} />}
          ListEmptyComponent={<Text style={{ color: colors.textMuted, textAlign: "center", marginTop: 40 }}>No reports found.</Text>}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={{ flexDirection: "row", alignItems: "center", backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md }}
              onPress={() => navigation.navigate("ReportView", { id: item.id })}
            >
              <Ionicons name={item.visualization === "CHART" ? "bar-chart-outline" : "list-outline"} size={20} color={colors.primary} style={{ marginRight: 10 }} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.text, fontSize: 14, fontWeight: "700" }}>{item.name}</Text>
                <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }}>
                  {item.isOwner ? "Your report" : `Shared by ${item.ownerName}`}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  );
}
