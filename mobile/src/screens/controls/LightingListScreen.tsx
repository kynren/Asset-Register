import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { ActivityIndicator, FlatList, RefreshControl, Switch, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { axiosClient } from "../../api/axiosClient";
import { useAuth } from "../../auth/AuthContext";
import { useTheme } from "../../theme/ThemeContext";
import { LightingDevice, LightingScene } from "../../types/controls";
import { MoreStackParamList } from "../../navigation/types";

export function LightingListScreen() {
  const { colors, spacing, radius } = useTheme();
  const { hasPermission } = useAuth();
  const navigation = useNavigation<NativeStackNavigationProp<MoreStackParamList>>();
  const queryClient = useQueryClient();
  const canEdit = hasPermission("lighting", "edit");

  const devicesQuery = useQuery({
    queryKey: ["mobile-lighting-devices"],
    queryFn: async () => (await axiosClient.get("/lighting/devices")).data as LightingDevice[],
  });
  const scenesQuery = useQuery({
    queryKey: ["mobile-lighting-scenes"],
    queryFn: async () => (await axiosClient.get("/lighting/scenes")).data as LightingScene[],
  });

  const powerMutation = useMutation({
    mutationFn: ({ id, on }: { id: number; on: boolean }) => axiosClient.post(`/lighting/devices/${id}/power`, { on }),
    onMutate: async ({ id, on }) => {
      await queryClient.cancelQueries({ queryKey: ["mobile-lighting-devices"] });
      const previous = queryClient.getQueryData<LightingDevice[]>(["mobile-lighting-devices"]);
      queryClient.setQueryData<LightingDevice[]>(["mobile-lighting-devices"], (old) => old?.map((d) => (d.id === id ? { ...d, isOn: on } : d)));
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(["mobile-lighting-devices"], context.previous);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["mobile-lighting-devices"] }),
  });

  const activateSceneMutation = useMutation({
    mutationFn: (id: number) => axiosClient.post(`/lighting/scenes/${id}/activate`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["mobile-lighting-devices"] }),
  });

  const devices = devicesQuery.data ?? [];
  const scenes = scenesQuery.data ?? [];

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <TouchableOpacity
        style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginHorizontal: spacing.lg, marginTop: spacing.lg, backgroundColor: colors.primary + "1a", borderRadius: radius.md, borderWidth: 1, borderColor: colors.primary, paddingVertical: 10 }}
        onPress={() => navigation.navigate("LightingSiteMapList")}
      >
        <Ionicons name="map-outline" size={16} color={colors.primary} />
        <Text style={{ color: colors.primary, fontWeight: "700", fontSize: 12.5 }}>View Site Maps</Text>
      </TouchableOpacity>

      {scenes.length > 0 && (
        <View style={{ paddingTop: spacing.lg, paddingBottom: spacing.sm }}>
          <Text style={{ color: colors.textMuted, fontSize: 12, fontWeight: "700", marginLeft: spacing.lg, marginBottom: 8, textTransform: "uppercase" }}>Scenes</Text>
          <FlatList
            horizontal
            showsHorizontalScrollIndicator={false}
            data={scenes}
            keyExtractor={(s) => String(s.id)}
            contentContainerStyle={{ paddingHorizontal: spacing.lg, gap: spacing.sm }}
            renderItem={({ item }) => (
              <TouchableOpacity
                disabled={!canEdit || activateSceneMutation.isPending}
                onPress={() => activateSceneMutation.mutate(item.id)}
                style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 9, borderRadius: radius.pill, backgroundColor: colors.primarySoft, borderWidth: 1, borderColor: colors.primary }}
              >
                <Ionicons name="flash-outline" size={14} color={colors.primary} />
                <Text style={{ color: colors.primary, fontSize: 12.5, fontWeight: "700" }}>{item.name}</Text>
              </TouchableOpacity>
            )}
          />
        </View>
      )}

      {devicesQuery.isLoading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />
      ) : (
        <FlatList
          data={devices}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm }}
          refreshControl={<RefreshControl refreshing={devicesQuery.isRefetching} onRefresh={devicesQuery.refetch} tintColor={colors.primary} />}
          ListEmptyComponent={<Text style={{ color: colors.textMuted, textAlign: "center", marginTop: 40 }}>No lighting devices found.</Text>}
          renderItem={({ item }) => (
            <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md }}>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: item.status === "ONLINE" ? colors.success : colors.danger, marginRight: 10 }} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.text, fontSize: 14, fontWeight: "700" }}>{item.name}</Text>
                <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }}>
                  {item.location?.name ?? "No location"}
                  {item.powerW != null ? ` · ${item.powerW}W` : ""}
                </Text>
              </View>
              <Switch
                value={!!item.isOn}
                disabled={!canEdit || item.status !== "ONLINE"}
                onValueChange={(on) => powerMutation.mutate({ id: item.id, on })}
                trackColor={{ true: colors.primary, false: colors.border }}
              />
            </View>
          )}
        />
      )}
    </View>
  );
}
