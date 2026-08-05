import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ActivityIndicator, Alert, ScrollView, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import dayjs from "dayjs";
import { axiosClient } from "../../api/axiosClient";
import { useTheme } from "../../theme/ThemeContext";
import { useAuth } from "../../auth/AuthContext";

interface AgentKey {
  id: number;
  label: string | null;
  key: string;
  createdAt: string;
  isActive: boolean;
}

// Mirrors client/src/pages/appSettings/SystemSettingsTab.tsx — general settings, password/login
// policy, network relay toggle, and agent API keys. The Change Management schedule-vs-publish-now
// workflow stays web-only; mobile always saves immediately (same simplification as Roles).
export function SystemSettingsScreen() {
  const { colors, spacing, radius } = useTheme();
  const { hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const canEdit = hasPermission("app-settings", "edit");

  const { data: settings } = useQuery({ queryKey: ["mobile-system-settings"], queryFn: async () => (await axiosClient.get("/settings")).data as Record<string, string> });
  const [values, setValues] = useState<Record<string, string>>({});

  useEffect(() => {
    if (settings) setValues(settings);
  }, [settings]);

  const saveMutation = useMutation({
    mutationFn: () => axiosClient.put("/settings", { values }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mobile-system-settings"] });
      Alert.alert("Settings saved");
    },
  });

  const { data: agentKeys } = useQuery({ queryKey: ["mobile-agent-keys"], queryFn: async () => (await axiosClient.get("/settings/agent-keys")).data as AgentKey[] });
  const [newKey, setNewKey] = useState<string | null>(null);
  const createKeyMutation = useMutation({
    mutationFn: () => axiosClient.post("/settings/agent-keys", { label: "New Key" }),
    onSuccess: (res) => {
      setNewKey(res.data.key);
      queryClient.invalidateQueries({ queryKey: ["mobile-agent-keys"] });
    },
  });
  const toggleKeyMutation = useMutation({
    mutationFn: (params: { id: number; isActive: boolean }) => axiosClient.patch(`/settings/agent-keys/${params.id}`, { isActive: params.isActive }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["mobile-agent-keys"] }),
  });

  function field(key: string, label: string, options?: { keyboardType?: "numeric" }) {
    return (
      <View key={key} style={{ marginBottom: spacing.md }}>
        <Text style={{ color: colors.textMuted, fontSize: 12, fontWeight: "700", marginBottom: 6, textTransform: "uppercase" }}>{label}</Text>
        <TextInput
          style={{ borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: colors.text, backgroundColor: colors.surface }}
          value={values[key] ?? ""}
          onChangeText={(v) => setValues((s) => ({ ...s, [key]: v }))}
          keyboardType={options?.keyboardType}
          editable={canEdit}
        />
      </View>
    );
  }

  function toggle(key: string, label: string) {
    const active = values[key] === "true";
    return (
      <TouchableOpacity key={key} style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: spacing.md }} disabled={!canEdit} onPress={() => setValues((s) => ({ ...s, [key]: active ? "false" : "true" }))}>
        <Ionicons name={active ? "checkbox" : "square-outline"} size={20} color={active ? colors.primary : colors.textMuted} />
        <Text style={{ color: colors.text, fontSize: 12.5, flex: 1 }}>{label}</Text>
      </TouchableOpacity>
    );
  }

  const sectionTitle = { color: colors.text, fontSize: 14, fontWeight: "700" as const, marginBottom: spacing.md };
  const panel = { backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, marginBottom: spacing.md };
  const saveButton = (
    <TouchableOpacity style={{ backgroundColor: colors.primary, borderRadius: radius.md, alignItems: "center", paddingVertical: 12, opacity: canEdit ? 1 : 0.5 }} disabled={!canEdit || saveMutation.isPending} onPress={() => saveMutation.mutate()}>
      {saveMutation.isPending ? <ActivityIndicator color="#fff" /> : <Text style={{ color: "#fff", fontWeight: "700", fontSize: 13 }}>Save</Text>}
    </TouchableOpacity>
  );

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: spacing.lg }}>
      <View style={panel}>
        <Text style={sectionTitle}>General Settings</Text>
        {field("passwordMinLength", "Minimum Password Length", { keyboardType: "numeric" })}
        {field("deviceOfflineThresholdMinutes", "Device Offline Threshold (minutes)", { keyboardType: "numeric" })}
        {field("cameraRetentionDays", "Camera Recording Retention (days)", { keyboardType: "numeric" })}
        {field("vaultDecryptTimeoutSeconds", "Decrypted Password Auto-Lock (seconds)", { keyboardType: "numeric" })}
        {field("stockSkuPrefix", "Stock SKU Prefix")}
        {saveButton}
      </View>

      <View style={panel}>
        <Text style={sectionTitle}>Password & Login Security Policy</Text>
        {toggle("passwordRequireComplexity", "Require uppercase, lowercase, number & symbol")}
        {field("passwordMaxAgeDays", "Password Expiry (days, blank = never)", { keyboardType: "numeric" })}
        {field("passwordHistoryCount", "Prevent Reuse of Last N Passwords", { keyboardType: "numeric" })}
        {field("maxFailedLoginAttempts", "Max Failed Login Attempts", { keyboardType: "numeric" })}
        {field("lockoutDurationMinutes", "Lockout Duration (minutes)", { keyboardType: "numeric" })}
        {saveButton}
      </View>

      <View style={panel}>
        <Text style={sectionTitle}>Network Relay Agent</Text>
        <Text style={{ color: colors.textMuted, fontSize: 11.5, marginBottom: spacing.md }}>
          If this app is hosted on a cloud VPS, it has no route into your office's LAN. Enable this once the relay agent is running on a machine inside the LAN.
        </Text>
        {toggle("networkRelayEnabled", "Route network scans through an on-prem relay agent")}
        {saveButton}
      </View>

      <View style={panel}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.md }}>
          <Text style={[sectionTitle, { marginBottom: 0 }]}>Agent API Keys</Text>
          {hasPermission("app-settings", "create") && (
            <TouchableOpacity style={{ flexDirection: "row", alignItems: "center", gap: 4, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 10, paddingVertical: 6 }} onPress={() => createKeyMutation.mutate()}>
              <Ionicons name="add" size={14} color={colors.text} />
              <Text style={{ color: colors.text, fontSize: 11.5, fontWeight: "700" }}>Generate</Text>
            </TouchableOpacity>
          )}
        </View>
        {newKey && (
          <View style={{ backgroundColor: colors.success + "22", borderRadius: radius.md, padding: 10, marginBottom: spacing.md }}>
            <Text style={{ color: colors.success, fontSize: 11.5, fontWeight: "700", marginBottom: 4 }}>Key generated — copy it now, it won't be shown again:</Text>
            <Text selectable style={{ color: colors.text, fontSize: 11, fontFamily: "monospace" }}>{newKey}</Text>
            <TouchableOpacity onPress={() => setNewKey(null)} style={{ marginTop: 6 }}>
              <Text style={{ color: colors.textMuted, fontSize: 11 }}>Dismiss</Text>
            </TouchableOpacity>
          </View>
        )}
        {(agentKeys ?? []).map((k) => (
          <View key={k.id} style={{ flexDirection: "row", alignItems: "center", paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border }}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.text, fontSize: 12.5, fontWeight: "600" }}>{k.label ?? "—"}</Text>
              <Text style={{ color: colors.textMuted, fontSize: 10.5, fontFamily: "monospace" }}>{k.key.slice(0, 16)}... · {dayjs(k.createdAt).format("DD MMM YYYY")}</Text>
            </View>
            <View style={{ backgroundColor: k.isActive ? colors.success + "22" : colors.border, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, marginRight: 8 }}>
              <Text style={{ color: k.isActive ? colors.success : colors.textMuted, fontSize: 10, fontWeight: "700" }}>{k.isActive ? "Active" : "Revoked"}</Text>
            </View>
            {canEdit && (
              <TouchableOpacity onPress={() => toggleKeyMutation.mutate({ id: k.id, isActive: !k.isActive })}>
                <Text style={{ color: colors.primary, fontSize: 11, fontWeight: "700" }}>{k.isActive ? "Revoke" : "Reactivate"}</Text>
              </TouchableOpacity>
            )}
          </View>
        ))}
      </View>
    </ScrollView>
  );
}
