import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { ActivityIndicator, Alert, FlatList, RefreshControl, Switch, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { axiosClient } from "../../api/axiosClient";
import { useAuth } from "../../auth/AuthContext";
import { useTheme } from "../../theme/ThemeContext";
import { ShimmerList } from "../../components/Shimmer";
import { BottomSheet } from "../../components/BottomSheet";
import { SwipeableRow } from "../../components/SwipeableRow";
import { OpeningAnimation } from "../../components/OpeningAnimation";
import { LightingDevice, LightingScene } from "../../types/controls";
import { MoreStackParamList } from "../../navigation/types";

export function LightingListScreen() {
  const { colors, spacing, radius } = useTheme();
  const { hasPermission } = useAuth();
  const navigation = useNavigation<NativeStackNavigationProp<MoreStackParamList>>();
  const queryClient = useQueryClient();
  const canEdit = hasPermission("lighting", "edit");
  const canCreate = hasPermission("lighting", "create");
  const canDelete = hasPermission("lighting", "delete");

  const devicesQuery = useQuery({
    queryKey: ["mobile-lighting-devices"],
    queryFn: async () => (await axiosClient.get("/lighting/devices")).data as LightingDevice[],
  });
  const scenesQuery = useQuery({
    queryKey: ["mobile-lighting-scenes"],
    queryFn: async () => (await axiosClient.get("/lighting/scenes")).data as LightingScene[],
  });

  const [activeDevice, setActiveDevice] = useState<LightingDevice | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [playKey, setPlayKey] = useState(0);
  const [addSheetOpen, setAddSheetOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newIp, setNewIp] = useState("");

  const powerMutation = useMutation({
    mutationFn: ({ id, on }: { id: number; on: boolean }) => axiosClient.post(`/lighting/devices/${id}/power`, { on }),
    onMutate: async ({ id, on }) => {
      setPlayKey((k) => k + 1);
      await queryClient.cancelQueries({ queryKey: ["mobile-lighting-devices"] });
      const previous = queryClient.getQueryData<LightingDevice[]>(["mobile-lighting-devices"]);
      queryClient.setQueryData<LightingDevice[]>(["mobile-lighting-devices"], (old) => old?.map((d) => (d.id === id ? { ...d, isOn: on } : d)));
      setActiveDevice((d) => (d && d.id === id ? { ...d, isOn: on } : d));
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(["mobile-lighting-devices"], context.previous);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["mobile-lighting-devices"] }),
  });

  const brightnessMutation = useMutation({
    mutationFn: ({ id, value }: { id: number; value: number }) => axiosClient.post(`/lighting/devices/${id}/brightness`, { value }),
    onSuccess: (_res, { id, value }) => {
      queryClient.invalidateQueries({ queryKey: ["mobile-lighting-devices"] });
      setActiveDevice((d) => (d && d.id === id ? { ...d, brightness: value } : d));
    },
  });

  const renameMutation = useMutation({
    mutationFn: ({ id, name }: { id: number; name: string }) => axiosClient.patch(`/lighting/devices/${id}`, { name }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mobile-lighting-devices"] });
      setRenaming(false);
      setActiveDevice(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => axiosClient.delete(`/lighting/devices/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mobile-lighting-devices"] });
      setActiveDevice(null);
    },
  });

  const createMutation = useMutation({
    mutationFn: () => axiosClient.post("/lighting/devices", { name: newName.trim(), ipAddress: newIp.trim() || undefined }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mobile-lighting-devices"] });
      setAddSheetOpen(false);
      setNewName("");
      setNewIp("");
    },
  });

  const activateSceneMutation = useMutation({
    mutationFn: (id: number) => axiosClient.post(`/lighting/scenes/${id}/activate`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["mobile-lighting-devices"] }),
  });

  function confirmDelete(device: LightingDevice) {
    Alert.alert("Delete Device", `Delete "${device.name}"? This cannot be undone.`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => deleteMutation.mutate(device.id) },
    ]);
  }

  const devices = devicesQuery.data ?? [];
  const scenes = scenesQuery.data ?? [];

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ flexDirection: "row", gap: spacing.sm, marginHorizontal: spacing.lg, marginTop: spacing.lg }}>
        <TouchableOpacity
          style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: colors.primary + "1a", borderRadius: radius.md, borderWidth: 1, borderColor: colors.primary, paddingVertical: 10 }}
          onPress={() => navigation.navigate("LightingSiteMapList")}
        >
          <Ionicons name="map-outline" size={16} color={colors.primary} />
          <Text style={{ color: colors.primary, fontWeight: "700", fontSize: 12.5 }}>View Site Maps</Text>
        </TouchableOpacity>
        {canCreate && (
          <TouchableOpacity
            style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: colors.primary + "1a", borderRadius: radius.md, borderWidth: 1, borderColor: colors.primary, paddingHorizontal: 14 }}
            onPress={() => setAddSheetOpen(true)}
          >
            <Ionicons name="add" size={16} color={colors.primary} />
          </TouchableOpacity>
        )}
      </View>

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
        <ShimmerList />
      ) : (
        <FlatList
          data={devices}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm }}
          refreshControl={<RefreshControl refreshing={devicesQuery.isRefetching} onRefresh={devicesQuery.refetch} tintColor={colors.primary} />}
          ListEmptyComponent={<Text style={{ color: colors.textMuted, textAlign: "center", marginTop: 40 }}>No lighting devices found.</Text>}
          renderItem={({ item }) => (
            <SwipeableRow
              disabled={!canEdit || item.status !== "ONLINE"}
              onSwipeRight={() => powerMutation.mutate({ id: item.id, on: true })}
              onSwipeLeft={() => powerMutation.mutate({ id: item.id, on: false })}
              rightLabel="On"
              leftLabel="Off"
              rightIcon="flash-outline"
              leftIcon="flash-off-outline"
            >
              <TouchableOpacity
                style={{ flexDirection: "row", alignItems: "center", backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md }}
                onPress={() => setActiveDevice(item)}
              >
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
              </TouchableOpacity>
            </SwipeableRow>
          )}
        />
      )}

      <BottomSheet
        visible={!!activeDevice}
        onClose={() => {
          setActiveDevice(null);
          setRenaming(false);
        }}
        title={activeDevice?.name}
      >
        {activeDevice && (
          <View style={{ gap: spacing.sm }}>
            <View style={{ alignItems: "center", marginBottom: spacing.sm }}>
              <OpeningAnimation kind="light" playKey={playKey} active={!!activeDevice.isOn} size={52} />
            </View>

            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: colors.bg, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md }}>
              <Text style={{ color: colors.text, fontSize: 14, fontWeight: "600" }}>Power</Text>
              <Switch
                value={!!activeDevice.isOn}
                disabled={!canEdit || activeDevice.status !== "ONLINE" || powerMutation.isPending}
                onValueChange={(on) => powerMutation.mutate({ id: activeDevice.id, on })}
                trackColor={{ true: colors.primary, false: colors.border }}
              />
            </View>

            {canEdit && activeDevice.brightness != null && (
              <View style={{ backgroundColor: colors.bg, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md }}>
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                  <Text style={{ color: colors.text, fontSize: 14, fontWeight: "600" }}>Brightness</Text>
                  <Text style={{ color: colors.textMuted, fontSize: 13 }}>{activeDevice.brightness}%</Text>
                </View>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                  <TouchableOpacity
                    disabled={brightnessMutation.isPending}
                    onPress={() => brightnessMutation.mutate({ id: activeDevice.id, value: Math.max(0, (activeDevice.brightness ?? 0) - 10) })}
                    style={{ width: 36, height: 36, borderRadius: 18, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" }}
                  >
                    <Ionicons name="remove" size={18} color={colors.text} />
                  </TouchableOpacity>
                  <View style={{ flex: 1, height: 6, borderRadius: 3, backgroundColor: colors.border, overflow: "hidden" }}>
                    <View style={{ width: `${activeDevice.brightness}%`, height: "100%", backgroundColor: colors.primary }} />
                  </View>
                  <TouchableOpacity
                    disabled={brightnessMutation.isPending}
                    onPress={() => brightnessMutation.mutate({ id: activeDevice.id, value: Math.min(100, (activeDevice.brightness ?? 0) + 10) })}
                    style={{ width: 36, height: 36, borderRadius: 18, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" }}
                  >
                    <Ionicons name="add" size={18} color={colors.text} />
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {renaming ? (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: spacing.sm }}>
                <TextInput
                  style={{ flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: colors.text, backgroundColor: colors.bg }}
                  value={renameValue}
                  onChangeText={setRenameValue}
                  autoFocus
                />
                <TouchableOpacity
                  disabled={renameMutation.isPending || !renameValue.trim()}
                  onPress={() => renameMutation.mutate({ id: activeDevice.id, name: renameValue.trim() })}
                  style={{ backgroundColor: colors.primary, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 10 }}
                >
                  {renameMutation.isPending ? <ActivityIndicator size="small" color="#fff" /> : <Text style={{ color: "#fff", fontWeight: "700", fontSize: 12.5 }}>Save</Text>}
                </TouchableOpacity>
              </View>
            ) : (
              canEdit && (
                <TouchableOpacity
                  style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: spacing.sm, marginTop: spacing.xs }}
                  onPress={() => {
                    setRenameValue(activeDevice.name);
                    setRenaming(true);
                  }}
                >
                  <Ionicons name="pencil-outline" size={17} color={colors.text} />
                  <Text style={{ color: colors.text, fontSize: 13.5, fontWeight: "600" }}>Rename Device</Text>
                </TouchableOpacity>
              )
            )}

            {canDelete && (
              <TouchableOpacity style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: spacing.sm }} onPress={() => confirmDelete(activeDevice)}>
                <Ionicons name="trash-outline" size={17} color={colors.danger} />
                <Text style={{ color: colors.danger, fontSize: 13.5, fontWeight: "600" }}>Delete Device</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </BottomSheet>

      <BottomSheet visible={addSheetOpen} onClose={() => setAddSheetOpen(false)} title="Add Lighting Device">
        <View style={{ gap: spacing.md }}>
          <View>
            <Text style={{ color: colors.textMuted, fontSize: 12, fontWeight: "700", marginBottom: 8, textTransform: "uppercase" }}>Name</Text>
            <TextInput
              style={{ borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: colors.text, backgroundColor: colors.bg }}
              placeholder="e.g. Lobby Ceiling Light"
              placeholderTextColor={colors.textMuted}
              value={newName}
              onChangeText={setNewName}
            />
          </View>
          <View>
            <Text style={{ color: colors.textMuted, fontSize: 12, fontWeight: "700", marginBottom: 8, textTransform: "uppercase" }}>IP Address (optional)</Text>
            <TextInput
              style={{ borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: colors.text, backgroundColor: colors.bg }}
              placeholder="e.g. 192.168.1.50"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="none"
              value={newIp}
              onChangeText={setNewIp}
            />
          </View>
          <TouchableOpacity
            disabled={!newName.trim() || createMutation.isPending}
            onPress={() => createMutation.mutate()}
            style={{ backgroundColor: colors.primary, borderRadius: radius.md, alignItems: "center", paddingVertical: 13, opacity: !newName.trim() ? 0.5 : 1 }}
          >
            {createMutation.isPending ? <ActivityIndicator color="#fff" /> : <Text style={{ color: "#fff", fontWeight: "700" }}>Create Device</Text>}
          </TouchableOpacity>
        </View>
      </BottomSheet>
    </View>
  );
}
