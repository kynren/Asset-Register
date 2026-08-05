import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { ActivityIndicator, FlatList, RefreshControl, Text, TouchableOpacity, View } from "react-native";
import { axiosClient } from "../../api/axiosClient";
import { useTheme } from "../../theme/ThemeContext";
import { AccessControlDevice, AccessDoor, DoorLockState } from "../../types/controls";
import { MoreStackParamList } from "../../navigation/types";

const LOCK_LABEL: Record<DoorLockState, string> = { LOCKED: "Locked", UNLOCKED: "Unlocked", UNKNOWN: "Unknown" };

interface FlatDoor extends AccessDoor {
  deviceName: string;
  locationName: string | null;
}

export function DoorListScreen() {
  const { colors, spacing, radius } = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<MoreStackParamList>>();

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ["mobile-access-control-devices"],
    queryFn: async () => (await axiosClient.get("/access-control/devices")).data as AccessControlDevice[],
  });

  const doors: FlatDoor[] = useMemo(
    () => (data ?? []).flatMap((device) => device.doors.map((door) => ({ ...door, deviceName: device.name, locationName: device.location?.name ?? null }))),
    [data]
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      {isLoading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />
      ) : (
        <FlatList
          data={doors}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm }}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.primary} />}
          ListEmptyComponent={<Text style={{ color: colors.textMuted, textAlign: "center", marginTop: 40 }}>No doors found.</Text>}
          renderItem={({ item }) => {
            const locked = item.lockState === "LOCKED";
            const tone = item.lockState === "UNKNOWN" ? colors.textMuted : locked ? colors.success : colors.danger;
            return (
              <TouchableOpacity
                style={{ flexDirection: "row", alignItems: "center", backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md }}
                onPress={() => navigation.navigate("DoorDetail", { id: item.id })}
              >
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.text, fontSize: 14, fontWeight: "700" }}>{item.name}</Text>
                  <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }}>
                    {item.deviceName}
                    {item.locationName ? ` · ${item.locationName}` : ""}
                  </Text>
                </View>
                <View style={{ backgroundColor: tone + "22", borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 3 }}>
                  <Text style={{ color: tone, fontSize: 11, fontWeight: "700" }}>{LOCK_LABEL[item.lockState]}</Text>
                </View>
              </TouchableOpacity>
            );
          }}
        />
      )}
    </View>
  );
}
