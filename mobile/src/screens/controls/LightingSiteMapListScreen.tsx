import { useQuery } from "@tanstack/react-query";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { ActivityIndicator, FlatList, Image, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { axiosClient } from "../../api/axiosClient";
import { useTheme } from "../../theme/ThemeContext";
import { API_ORIGIN } from "../../config/env";
import { MoreStackParamList } from "../../navigation/types";

interface SiteMapSummary {
  id: number;
  name: string;
  imageUrl: string;
  sortOrder: number;
}

// Mobile port of client/src/pages/lighting/SiteMapTab.tsx's map picker grid — opens a read-only
// viewer (LightingSiteMapViewScreen) with tap-to-toggle device markers. The full freehand
// zone/path drawing editor (SiteMapEditor.tsx) stays desktop-only: placing/reshaping markers on a
// floor plan is a precision mouse task, not a touch one, same rationale already applied to
// Database Relationships and Network Topology's ReactFlow graphs elsewhere in this app.
export function LightingSiteMapListScreen() {
  const { colors, spacing, radius } = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<MoreStackParamList>>();

  const { data, isLoading } = useQuery({
    queryKey: ["mobile-lighting-site-maps"],
    queryFn: async () => (await axiosClient.get("/lighting/site-maps")).data as SiteMapSummary[],
  });

  if (isLoading) return <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <FlatList
        data={data ?? []}
        keyExtractor={(item) => String(item.id)}
        numColumns={2}
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm }}
        columnWrapperStyle={{ gap: spacing.sm }}
        ListEmptyComponent={
          <Text style={{ color: colors.textMuted, textAlign: "center", marginTop: 24 }}>
            No site maps yet. Add one from the web app to place lights on a floor plan.
          </Text>
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={{ flex: 1, backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, overflow: "hidden", marginBottom: spacing.sm }}
            onPress={() => navigation.navigate("LightingSiteMapView", { id: item.id, name: item.name })}
          >
            <Image source={{ uri: `${API_ORIGIN}${item.imageUrl}` }} style={{ width: "100%", height: 110, backgroundColor: colors.bg }} resizeMode="cover" />
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 10 }}>
              <Text style={{ color: colors.text, fontSize: 12.5, fontWeight: "700", flex: 1 }} numberOfLines={1}>{item.name}</Text>
              <Ionicons name="chevron-forward" size={14} color={colors.textMuted} />
            </View>
          </TouchableOpacity>
        )}
      />
    </View>
  );
}
