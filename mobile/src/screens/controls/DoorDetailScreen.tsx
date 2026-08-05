import { useLayoutEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import { ActivityIndicator, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import dayjs from "dayjs";
import { axiosClient } from "../../api/axiosClient";
import { useAuth } from "../../auth/AuthContext";
import { useTheme } from "../../theme/ThemeContext";
import { AccessControlDevice, DoorControlAction, DoorLockState } from "../../types/controls";
import { MoreStackParamList } from "../../navigation/types";

const LOCK_LABEL: Record<DoorLockState, string> = { LOCKED: "Locked", UNLOCKED: "Unlocked", UNKNOWN: "Unknown" };

const ACTIONS: { action: DoorControlAction; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { action: "open", label: "Open once", icon: "lock-open-outline" },
  { action: "close", label: "Close", icon: "lock-closed-outline" },
  { action: "alwaysOpen", label: "Hold open", icon: "infinite-outline" },
  { action: "alwaysClose", label: "Hold locked", icon: "shield-outline" },
  { action: "resume", label: "Resume schedule", icon: "refresh-outline" },
];

export function DoorDetailScreen() {
  const { colors, spacing, radius } = useTheme();
  const { hasPermission } = useAuth();
  const navigation = useNavigation();
  const route = useRoute<RouteProp<MoreStackParamList, "DoorDetail">>();
  const { id } = route.params;
  const queryClient = useQueryClient();
  const [pendingAction, setPendingAction] = useState<DoorControlAction | null>(null);
  const [lastResult, setLastResult] = useState<{ ok: boolean; message: string } | null>(null);

  const { data: devices, isLoading } = useQuery({
    queryKey: ["mobile-access-control-devices"],
    queryFn: async () => (await axiosClient.get("/access-control/devices")).data as AccessControlDevice[],
  });

  const found = useMemo(() => {
    for (const device of devices ?? []) {
      const door = device.doors.find((d) => d.id === id);
      if (door) return { door, device };
    }
    return null;
  }, [devices, id]);

  const controlMutation = useMutation({
    mutationFn: (action: DoorControlAction) => axiosClient.post(`/access-control/doors/${id}/control`, { action }),
    onMutate: (action) => setPendingAction(action),
    onSuccess: (res) => {
      setLastResult({ ok: res.data.ok, message: res.data.message });
      queryClient.invalidateQueries({ queryKey: ["mobile-access-control-devices"] });
    },
    onError: (err: any) => setLastResult({ ok: false, message: err?.response?.data?.error ?? "Command failed." }),
    onSettled: () => setPendingAction(null),
  });

  useLayoutEffect(() => {
    navigation.setOptions({ title: found?.door.name ?? "Door" });
  }, [navigation, found]);

  if (isLoading || !found) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg }}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  const { door, device } = found;
  const canEdit = hasPermission("access-control", "edit");
  const tone = door.lockState === "UNKNOWN" ? colors.textMuted : door.lockState === "LOCKED" ? colors.success : colors.danger;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, padding: spacing.lg }}>
      <View style={{ alignItems: "center", backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, marginBottom: spacing.lg }}>
        <Text style={{ color: colors.text, fontSize: 17, fontWeight: "800" }}>{door.name}</Text>
        <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }}>{device.name}</Text>
        <View style={{ backgroundColor: tone + "22", borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 4, marginTop: 10 }}>
          <Text style={{ color: tone, fontSize: 12, fontWeight: "700" }}>{LOCK_LABEL[door.lockState]}</Text>
        </View>
        {door.lastCheckedAt && (
          <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 8 }}>Last checked {dayjs(door.lastCheckedAt).format("DD MMM HH:mm")}</Text>
        )}
      </View>

      {lastResult && (
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            backgroundColor: (lastResult.ok ? colors.success : colors.danger) + "1a",
            borderRadius: radius.md,
            padding: spacing.md,
            marginBottom: spacing.lg,
          }}
        >
          <Ionicons name={lastResult.ok ? "checkmark-circle" : "close-circle"} size={18} color={lastResult.ok ? colors.success : colors.danger} />
          <Text style={{ color: lastResult.ok ? colors.success : colors.danger, fontWeight: "600", fontSize: 13, flex: 1 }}>{lastResult.message}</Text>
        </View>
      )}

      {canEdit ? (
        <View style={{ gap: spacing.sm }}>
          {ACTIONS.map((a) => (
            <TouchableOpacity
              key={a.action}
              disabled={pendingAction != null}
              onPress={() => controlMutation.mutate(a.action)}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 10,
                backgroundColor: colors.surface,
                borderRadius: radius.md,
                borderWidth: 1,
                borderColor: colors.border,
                padding: spacing.md,
                opacity: pendingAction != null && pendingAction !== a.action ? 0.5 : 1,
              }}
            >
              {pendingAction === a.action ? <ActivityIndicator size="small" color={colors.primary} /> : <Ionicons name={a.icon} size={18} color={colors.primary} />}
              <Text style={{ color: colors.text, fontSize: 14, fontWeight: "600" }}>{a.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      ) : (
        <Text style={{ color: colors.textMuted, fontSize: 13, textAlign: "center" }}>You don't have permission to control this door.</Text>
      )}
    </View>
  );
}
