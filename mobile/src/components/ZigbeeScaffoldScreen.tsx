import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ActivityIndicator, FlatList, ScrollView, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import dayjs from "dayjs";
import { axiosClient } from "../api/axiosClient";
import { useTheme } from "../theme/ThemeContext";
import { useAuth } from "../auth/AuthContext";
import { ModuleName } from "../lib/permissions";

interface Coordinator { id: number; serialPort: string | null; status: "DISCONNECTED" | "CONNECTED" | "ERROR"; lastError: string | null; updatedAt: string }
interface ZigbeeDevice { id: number; ieeeAddress: string; friendlyName: string; deviceType: string; lastSeenAt: string | null }

// Shared by Lighting and Access Control — mirrors client/src/components/ZigbeeScaffoldTab.tsx.
// NOT hardware-verified: no coordinator dongle in this environment, so Test Connection always
// reports a clear failure rather than faking success (see server/src/lib/zigbeeCoordinator.ts).
export function ZigbeeScaffoldScreen({ apiBase, module }: { apiBase: string; module: ModuleName }) {
  const { colors, spacing, radius } = useTheme();
  const { hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const [serialPort, setSerialPort] = useState<string | null>(null);

  const { data: coordinator } = useQuery({ queryKey: [`mobile-${apiBase}-zigbee-coordinator`], queryFn: async () => (await axiosClient.get(`${apiBase}/zigbee/coordinator`)).data as Coordinator });
  const { data: devices } = useQuery({ queryKey: [`mobile-${apiBase}-zigbee-devices`], queryFn: async () => (await axiosClient.get(`${apiBase}/zigbee/devices`)).data as ZigbeeDevice[] });

  function invalidate() { queryClient.invalidateQueries({ queryKey: [`mobile-${apiBase}-zigbee-coordinator`] }); }

  const saveMutation = useMutation({ mutationFn: () => axiosClient.patch(`${apiBase}/zigbee/coordinator`, { serialPort }), onSuccess: invalidate });
  const connectMutation = useMutation({ mutationFn: () => axiosClient.post(`${apiBase}/zigbee/coordinator/connect`), onSuccess: invalidate });

  const currentPort = serialPort ?? coordinator?.serialPort ?? "";
  const canEdit = hasPermission(module, "edit");
  const statusColor = coordinator?.status === "CONNECTED" ? colors.success : coordinator?.status === "ERROR" ? colors.danger : colors.textMuted;
  const inputStyle = { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: colors.text, backgroundColor: colors.bg };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: spacing.lg }}>
      <View style={{ backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, marginBottom: spacing.md }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <Text style={{ color: colors.text, fontSize: 14, fontWeight: "700" }}>Coordinator</Text>
          {coordinator && (
            <View style={{ backgroundColor: statusColor + "22", borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 }}>
              <Text style={{ color: statusColor, fontSize: 10, fontWeight: "700" }}>{coordinator.status}</Text>
            </View>
          )}
        </View>
        <Text style={{ color: colors.textMuted, fontSize: 11.5, marginBottom: spacing.sm }}>
          Bridges paired ZigBee devices to this app via a USB coordinator dongle. This is a scaffold — no coordinator hardware is wired up in this build yet, so Test Connection will not succeed until that's added.
        </Text>
        <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: "700", marginBottom: 4 }}>Serial Port</Text>
        <TextInput style={inputStyle} placeholder="e.g. COM3 or /dev/ttyUSB0" placeholderTextColor={colors.textMuted} value={currentPort} onChangeText={setSerialPort} editable={canEdit} autoCapitalize="none" />
        {canEdit && (
          <View style={{ flexDirection: "row", gap: 8, marginTop: spacing.sm }}>
            <TouchableOpacity style={{ flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, alignItems: "center", paddingVertical: 12 }} disabled={saveMutation.isPending} onPress={() => saveMutation.mutate()}>
              {saveMutation.isPending ? <ActivityIndicator color={colors.text} /> : <Text style={{ color: colors.text, fontWeight: "700", fontSize: 12.5 }}>Save</Text>}
            </TouchableOpacity>
            <TouchableOpacity style={{ flex: 1, backgroundColor: colors.primary, borderRadius: radius.md, alignItems: "center", paddingVertical: 12 }} disabled={connectMutation.isPending} onPress={() => connectMutation.mutate()}>
              {connectMutation.isPending ? <ActivityIndicator color="#fff" /> : <Text style={{ color: "#fff", fontWeight: "700", fontSize: 12.5 }}>Test Connection</Text>}
            </TouchableOpacity>
          </View>
        )}
        {coordinator?.lastError && <Text style={{ color: colors.danger, fontSize: 11.5, marginTop: spacing.sm }}>{coordinator.lastError}</Text>}
      </View>

      <View style={{ backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.sm }}>
          <Text style={{ color: colors.text, fontSize: 14, fontWeight: "700" }}>Paired Devices</Text>
          {coordinator && <Text style={{ color: colors.textMuted, fontSize: 10.5 }}>Last checked {dayjs(coordinator.updatedAt).format("HH:mm:ss")}</Text>}
        </View>
        <FlatList
          data={devices ?? []}
          keyExtractor={(d) => String(d.id)}
          scrollEnabled={false}
          ListEmptyComponent={<Text style={{ color: colors.textMuted, fontSize: 12 }}>No devices paired yet — connect a coordinator to permit joining and discover devices.</Text>}
          renderItem={({ item: d }) => (
            <View style={{ paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border }}>
              <Text style={{ color: colors.text, fontSize: 13, fontWeight: "600" }}>{d.friendlyName}</Text>
              <Text style={{ color: colors.textMuted, fontSize: 10.5, fontFamily: "monospace", marginTop: 2 }}>{d.ieeeAddress} · {d.deviceType}</Text>
              <Text style={{ color: colors.textMuted, fontSize: 10.5, marginTop: 1 }}>{d.lastSeenAt ? `Last seen ${dayjs(d.lastSeenAt).format("DD MMM, HH:mm")}` : "Never seen"}</Text>
            </View>
          )}
        />
      </View>
    </ScrollView>
  );
}
