import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { ActivityIndicator, Alert, FlatList, RefreshControl, ScrollView, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { axiosClient } from "../../api/axiosClient";
import { useAuth } from "../../auth/AuthContext";
import { useTheme } from "../../theme/ThemeContext";
import { ShimmerList } from "../../components/Shimmer";
import { BottomSheet } from "../../components/BottomSheet";
import { SwipeableRow } from "../../components/SwipeableRow";
import { OpeningAnimation } from "../../components/OpeningAnimation";
import { AccessControlDevice, AccessDoor, DoorControlAction, DoorLockState } from "../../types/controls";
import { MoreStackParamList } from "../../navigation/types";

const LOCK_LABEL: Record<DoorLockState, string> = { LOCKED: "Locked", UNLOCKED: "Unlocked", UNKNOWN: "Unknown" };

const QUICK_ACTIONS: { action: DoorControlAction; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { action: "open", label: "Open once", icon: "lock-open-outline" },
  { action: "close", label: "Close", icon: "lock-closed-outline" },
  { action: "alwaysOpen", label: "Hold open", icon: "infinite-outline" },
  { action: "alwaysClose", label: "Hold locked", icon: "shield-outline" },
  { action: "resume", label: "Resume schedule", icon: "refresh-outline" },
];

interface FlatDoor extends AccessDoor {
  deviceName: string;
  locationName: string | null;
}

export function DoorListScreen() {
  const { colors, spacing, radius } = useTheme();
  const { hasPermission } = useAuth();
  const navigation = useNavigation<NativeStackNavigationProp<MoreStackParamList>>();
  const queryClient = useQueryClient();
  const canEdit = hasPermission("access-control", "edit");
  const canCreate = hasPermission("access-control", "create");
  const canDelete = hasPermission("access-control", "delete");

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ["mobile-access-control-devices"],
    queryFn: async () => (await axiosClient.get("/access-control/devices")).data as AccessControlDevice[],
  });

  const doors: FlatDoor[] = useMemo(
    () => (data ?? []).flatMap((device) => device.doors.map((door) => ({ ...door, deviceName: device.name, locationName: device.location?.name ?? null }))),
    [data]
  );

  const [activeDoor, setActiveDoor] = useState<FlatDoor | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [renaming, setRenaming] = useState(false);
  const [playKey, setPlayKey] = useState(0);
  const [addSheetOpen, setAddSheetOpen] = useState(false);
  const [newDoorDeviceId, setNewDoorDeviceId] = useState<number | null>(null);
  const [newDoorName, setNewDoorName] = useState("");
  const [newDoorNumber, setNewDoorNumber] = useState("");

  const controlMutation = useMutation({
    mutationFn: ({ id, action }: { id: number; action: DoorControlAction }) => axiosClient.post(`/access-control/doors/${id}/control`, { action }),
    onMutate: () => setPlayKey((k) => k + 1),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["mobile-access-control-devices"] }),
  });

  const renameMutation = useMutation({
    mutationFn: ({ id, name }: { id: number; name: string }) => axiosClient.patch(`/access-control/doors/${id}`, { name }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mobile-access-control-devices"] });
      setRenaming(false);
      setActiveDoor(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => axiosClient.delete(`/access-control/doors/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mobile-access-control-devices"] });
      setActiveDoor(null);
    },
  });

  const createMutation = useMutation({
    mutationFn: () =>
      axiosClient.post(`/access-control/devices/${newDoorDeviceId}/doors`, { name: newDoorName.trim(), doorNumber: Number(newDoorNumber) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mobile-access-control-devices"] });
      setAddSheetOpen(false);
      setNewDoorDeviceId(null);
      setNewDoorName("");
      setNewDoorNumber("");
    },
  });

  function confirmDelete(door: FlatDoor) {
    Alert.alert("Delete Door", `Delete "${door.name}"? This cannot be undone.`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => deleteMutation.mutate(door.id) },
    ]);
  }

  const tone = (state: DoorLockState) => (state === "UNKNOWN" ? colors.textMuted : state === "LOCKED" ? colors.success : colors.danger);

  const NAV_BUTTONS: { key: keyof MoreStackParamList; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
    { key: "AccessDevices", label: "Devices", icon: "hardware-chip-outline" },
    { key: "Persons", label: "Persons", icon: "people-outline" },
    { key: "AccessGroups", label: "Access Groups", icon: "albums-outline" },
    { key: "Credentials", label: "Credentials", icon: "id-card-outline" },
    { key: "AccessEventLog", label: "Event Log", icon: "receipt-outline" },
    { key: "AccessControlZigbee", label: "ZigBee", icon: "bluetooth-outline" },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: spacing.lg, paddingTop: spacing.lg }}>
        {NAV_BUTTONS.map((b) => (
          <TouchableOpacity
            key={b.key}
            style={{ flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 8 }}
            onPress={() => navigation.navigate(b.key as any)}
          >
            <Ionicons name={b.icon} size={14} color={colors.text} />
            <Text style={{ color: colors.text, fontSize: 12, fontWeight: "600" }}>{b.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {canCreate && (
        <TouchableOpacity
          style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginHorizontal: spacing.lg, marginTop: spacing.lg, backgroundColor: colors.primary + "1a", borderRadius: radius.md, borderWidth: 1, borderColor: colors.primary, paddingVertical: 10 }}
          onPress={() => {
            setNewDoorDeviceId((data ?? [])[0]?.id ?? null);
            setAddSheetOpen(true);
          }}
        >
          <Ionicons name="add" size={16} color={colors.primary} />
          <Text style={{ color: colors.primary, fontWeight: "700", fontSize: 12.5 }}>Add Door</Text>
        </TouchableOpacity>
      )}

      {isLoading ? (
        <ShimmerList />
      ) : (
        <FlatList
          data={doors}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm }}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.primary} />}
          ListEmptyComponent={<Text style={{ color: colors.textMuted, textAlign: "center", marginTop: 40 }}>No doors found.</Text>}
          renderItem={({ item }) => (
            <SwipeableRow
              disabled={!canEdit}
              onSwipeRight={() => controlMutation.mutate({ id: item.id, action: "open" })}
              onSwipeLeft={() => controlMutation.mutate({ id: item.id, action: "close" })}
              rightLabel="Open"
              leftLabel="Close"
              rightIcon="lock-open-outline"
              leftIcon="lock-closed-outline"
            >
              <TouchableOpacity
                style={{ flexDirection: "row", alignItems: "center", backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md }}
                onPress={() => setActiveDoor(item)}
              >
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.text, fontSize: 14, fontWeight: "700" }}>{item.name}</Text>
                  <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }}>
                    {item.deviceName}
                    {item.locationName ? ` · ${item.locationName}` : ""}
                  </Text>
                </View>
                <View style={{ backgroundColor: tone(item.lockState) + "22", borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 3 }}>
                  <Text style={{ color: tone(item.lockState), fontSize: 11, fontWeight: "700" }}>{LOCK_LABEL[item.lockState]}</Text>
                </View>
              </TouchableOpacity>
            </SwipeableRow>
          )}
        />
      )}

      <BottomSheet
        visible={!!activeDoor}
        onClose={() => {
          setActiveDoor(null);
          setRenaming(false);
        }}
        title={activeDoor?.name}
      >
        {activeDoor && (
          <View style={{ gap: spacing.sm }}>
            <View style={{ alignItems: "center", marginBottom: spacing.sm }}>
              <OpeningAnimation kind="door" playKey={playKey} active={activeDoor.lockState === "UNLOCKED"} size={52} />
            </View>

            {canEdit &&
              QUICK_ACTIONS.map((a) => (
                <TouchableOpacity
                  key={a.action}
                  disabled={controlMutation.isPending}
                  onPress={() => controlMutation.mutate({ id: activeDoor.id, action: a.action })}
                  style={{ flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: colors.bg, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md }}
                >
                  <Ionicons name={a.icon} size={18} color={colors.primary} />
                  <Text style={{ color: colors.text, fontSize: 14, fontWeight: "600" }}>{a.label}</Text>
                </TouchableOpacity>
              ))}

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
                  onPress={() => renameMutation.mutate({ id: activeDoor.id, name: renameValue.trim() })}
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
                    setRenameValue(activeDoor.name);
                    setRenaming(true);
                  }}
                >
                  <Ionicons name="pencil-outline" size={17} color={colors.text} />
                  <Text style={{ color: colors.text, fontSize: 13.5, fontWeight: "600" }}>Rename Door</Text>
                </TouchableOpacity>
              )
            )}

            <TouchableOpacity
              style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: spacing.sm }}
              onPress={() => {
                const id = activeDoor.id;
                setActiveDoor(null);
                navigation.navigate("DoorDetail", { id });
              }}
            >
              <Ionicons name="information-circle-outline" size={17} color={colors.text} />
              <Text style={{ color: colors.text, fontSize: 13.5, fontWeight: "600" }}>View Full Details</Text>
            </TouchableOpacity>

            {canDelete && (
              <TouchableOpacity style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: spacing.sm }} onPress={() => confirmDelete(activeDoor)}>
                <Ionicons name="trash-outline" size={17} color={colors.danger} />
                <Text style={{ color: colors.danger, fontSize: 13.5, fontWeight: "600" }}>Delete Door</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </BottomSheet>

      <BottomSheet visible={addSheetOpen} onClose={() => setAddSheetOpen(false)} title="Add Door">
        <View style={{ gap: spacing.md }}>
          <View>
            <Text style={{ color: colors.textMuted, fontSize: 12, fontWeight: "700", marginBottom: 8, textTransform: "uppercase" }}>Device</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {(data ?? []).map((d) => (
                <TouchableOpacity
                  key={d.id}
                  onPress={() => setNewDoorDeviceId(d.id)}
                  style={{
                    borderWidth: 1,
                    borderColor: newDoorDeviceId === d.id ? colors.primary : colors.border,
                    backgroundColor: newDoorDeviceId === d.id ? colors.primary + "22" : colors.bg,
                    borderRadius: radius.md,
                    paddingHorizontal: 12,
                    paddingVertical: 8,
                  }}
                >
                  <Text style={{ color: newDoorDeviceId === d.id ? colors.primary : colors.text, fontSize: 12.5, fontWeight: "600" }}>{d.name}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
          <View>
            <Text style={{ color: colors.textMuted, fontSize: 12, fontWeight: "700", marginBottom: 8, textTransform: "uppercase" }}>Door Name</Text>
            <TextInput
              style={{ borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: colors.text, backgroundColor: colors.bg }}
              placeholder="e.g. Front Entrance"
              placeholderTextColor={colors.textMuted}
              value={newDoorName}
              onChangeText={setNewDoorName}
            />
          </View>
          <View>
            <Text style={{ color: colors.textMuted, fontSize: 12, fontWeight: "700", marginBottom: 8, textTransform: "uppercase" }}>Door Number</Text>
            <TextInput
              style={{ borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: colors.text, backgroundColor: colors.bg }}
              placeholder="e.g. 1"
              placeholderTextColor={colors.textMuted}
              keyboardType="numeric"
              value={newDoorNumber}
              onChangeText={setNewDoorNumber}
            />
          </View>
          <TouchableOpacity
            disabled={!newDoorDeviceId || !newDoorName.trim() || !newDoorNumber.trim() || createMutation.isPending}
            onPress={() => createMutation.mutate()}
            style={{ backgroundColor: colors.primary, borderRadius: radius.md, alignItems: "center", paddingVertical: 13, opacity: !newDoorDeviceId || !newDoorName.trim() || !newDoorNumber.trim() ? 0.5 : 1 }}
          >
            {createMutation.isPending ? <ActivityIndicator color="#fff" /> : <Text style={{ color: "#fff", fontWeight: "700" }}>Create Door</Text>}
          </TouchableOpacity>
        </View>
      </BottomSheet>
    </View>
  );
}
