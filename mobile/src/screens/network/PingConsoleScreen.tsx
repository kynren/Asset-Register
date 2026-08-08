import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ScrollView, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { axiosClient } from "../../api/axiosClient";
import { useTheme } from "../../theme/ThemeContext";
import { useAuth } from "../../auth/AuthContext";
import { PickerModal, PickerOption } from "../../components/PickerModal";
import { KeyboardAvoidingScreen } from "../../components/KeyboardAvoidingScreen";
import {
  ConsoleLine,
  getPingSessionSnapshot,
  setPingCount,
  setPingHost,
  startPingSession,
  stopPingSession,
  subscribePingSession,
} from "./pingSession";

interface AssetDeviceOption { id: number; name: string; assetTag: string; staticIpAddress: string | null }

const PACKET_OPTIONS: { value: number | "continuous"; label: string }[] = [
  { value: 1, label: "1" },
  { value: 4, label: "4" },
  { value: 8, label: "8" },
  { value: 12, label: "12" },
  { value: "continuous", label: "Cont." },
];

const LINE_COLOR: Record<ConsoleLine["kind"], string> = { reply: "#34d399", timeout: "#fbbf24", error: "#f87171", info: "#7b8497" };

// Mirrors client/src/pages/network/PingConsoleTab.tsx — same host input + quick-device-select +
// packet-count + console output UI. See pingSession.ts for why this drives the console via a
// polled POST /network/ping loop instead of the web's SSE stream.
export function PingConsoleScreen() {
  const { colors, spacing, radius } = useTheme();
  const { hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const session = useSyncExternalStore(subscribePingSession, getPingSessionSnapshot);
  const { host, count, running, lines } = session;
  const [devicePickerOpen, setDevicePickerOpen] = useState(false);
  const [showAddDevice, setShowAddDevice] = useState(false);
  const [nodeForm, setNodeForm] = useState({ type: "ROUTER", label: "", ipAddress: "" });
  const scrollRef = useRef<ScrollView>(null);

  const { data: assetDevices } = useQuery({ queryKey: ["mobile-network-asset-devices"], queryFn: async () => (await axiosClient.get("/network/asset-devices")).data as AssetDeviceOption[] });

  const addNodeMutation = useMutation({
    mutationFn: () => axiosClient.post("/network/nodes", nodeForm),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["mobile-network-graph"] }); setShowAddDevice(false); setNodeForm({ type: "ROUTER", label: "", ipAddress: "" }); },
  });

  const deviceOptions: PickerOption[] = (assetDevices ?? []).map((a) => ({ id: a.id, label: `${a.name} — ${a.assetTag}`, sublabel: a.staticIpAddress ?? "No IP set" }));

  useEffect(() => {
    scrollRef.current?.scrollToEnd({ animated: true });
  }, [lines]);

  function startPing() {
    if (!host.trim()) return;
    startPingSession(host, count);
  }

  const inputStyle = { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: colors.text, backgroundColor: colors.surface };

  return (
    <KeyboardAvoidingScreen>
      <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: spacing.lg }}>
        <View style={{ backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, marginBottom: spacing.md, gap: 10 }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Ionicons name="pulse-outline" size={16} color={colors.primary} />
              <Text style={{ color: colors.text, fontSize: 14, fontWeight: "700" }}>Single-Device ICMP Pinger</Text>
            </View>
            {hasPermission("network", "create") && (
              <TouchableOpacity onPress={() => setShowAddDevice((v) => !v)}>
                <Text style={{ color: colors.primary, fontSize: 12, fontWeight: "700" }}>{showAddDevice ? "Cancel" : "+ Add Device"}</Text>
              </TouchableOpacity>
            )}
          </View>

          {showAddDevice && (
            <View style={{ gap: 8, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 10 }}>
              <TextInput style={inputStyle} placeholder="Label (e.g. Core Switch — Server Room)" placeholderTextColor={colors.textMuted} value={nodeForm.label} onChangeText={(v) => setNodeForm((f) => ({ ...f, label: v }))} />
              <TextInput style={inputStyle} placeholder="IP Address" placeholderTextColor={colors.textMuted} value={nodeForm.ipAddress} onChangeText={(v) => setNodeForm((f) => ({ ...f, ipAddress: v }))} autoCapitalize="none" />
              <TouchableOpacity style={{ backgroundColor: colors.primary, borderRadius: radius.md, alignItems: "center", paddingVertical: 10, opacity: nodeForm.label.trim() ? 1 : 0.5 }} disabled={!nodeForm.label.trim() || addNodeMutation.isPending} onPress={() => addNodeMutation.mutate()}>
                <Text style={{ color: "#fff", fontWeight: "700", fontSize: 12.5 }}>Add Node</Text>
              </TouchableOpacity>
            </View>
          )}

          <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: "700" }}>Quick Device Select</Text>
          <TouchableOpacity style={[inputStyle, { flexDirection: "row", justifyContent: "space-between", alignItems: "center" }]} onPress={() => setDevicePickerOpen(true)}>
            <Text style={{ color: colors.textMuted, fontSize: 13.5 }}>-- Choose a Device --</Text>
            <Ionicons name="chevron-down" size={16} color={colors.textMuted} />
          </TouchableOpacity>

          <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: "700" }}>Target IP / Host</Text>
          <TextInput style={inputStyle} value={host} onChangeText={setPingHost} placeholder="10.12.10.1" placeholderTextColor={colors.textMuted} editable={!running} autoCapitalize="none" />

          <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: "700" }}>Packet Count</Text>
          <View style={{ flexDirection: "row", gap: 6 }}>
            {PACKET_OPTIONS.map((opt) => (
              <TouchableOpacity
                key={opt.label}
                style={{ flex: 1, alignItems: "center", paddingVertical: 9, borderRadius: radius.md, borderWidth: 1, borderColor: count === opt.value ? colors.primary : colors.border, backgroundColor: count === opt.value ? colors.primarySoft : "transparent" }}
                disabled={running}
                onPress={() => setPingCount(opt.value)}
              >
                <Text style={{ color: count === opt.value ? colors.primary : colors.text, fontSize: 12, fontWeight: "700" }}>{opt.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {running ? (
            <TouchableOpacity style={{ backgroundColor: colors.danger, borderRadius: radius.md, alignItems: "center", paddingVertical: 12 }} onPress={stopPingSession}>
              <Text style={{ color: "#fff", fontWeight: "700", fontSize: 13 }}>Stop</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={{ backgroundColor: colors.success, borderRadius: radius.md, alignItems: "center", paddingVertical: 12, opacity: host.trim() ? 1 : 0.5 }} disabled={!host.trim()} onPress={startPing}>
              <Text style={{ color: "#fff", fontWeight: "700", fontSize: 13 }}>Ping Target</Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={{ backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <Text style={{ color: colors.text, fontSize: 13, fontWeight: "700" }}>Interactive Ping Console</Text>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: running ? "#34d399" : colors.border }} />
          </View>
          <ScrollView ref={scrollRef} style={{ backgroundColor: "#000", borderRadius: radius.md, minHeight: 260, maxHeight: 340 }} contentContainerStyle={{ padding: 12 }}>
            {lines.length === 0 ? (
              <Text style={{ color: "#4b5568", textAlign: "center", marginTop: 100, fontSize: 12 }}>Console idle. Enter host IP and execute ICMP Ping to trigger live replies.</Text>
            ) : (
              lines.map((line) => (
                <Text key={line.id} style={{ color: LINE_COLOR[line.kind], fontFamily: "monospace", fontSize: 11.5, marginBottom: 2 }}>{line.text}</Text>
              ))
            )}
          </ScrollView>
        </View>

        <PickerModal
          visible={devicePickerOpen}
          title="Choose a Device"
          options={deviceOptions}
          searchable
          onSelect={(id) => {
            const device = (assetDevices ?? []).find((a) => a.id === id);
            if (device?.staticIpAddress) setPingHost(device.staticIpAddress);
          }}
          onClose={() => setDevicePickerOpen(false)}
        />
      </ScrollView>
    </KeyboardAvoidingScreen>
  );
}
