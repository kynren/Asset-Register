import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ActivityIndicator, Alert, FlatList, ScrollView, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import dayjs from "dayjs";
import { axiosClient } from "../../api/axiosClient";
import { useTheme } from "../../theme/ThemeContext";
import { useAuth } from "../../auth/AuthContext";
import { useToast } from "../../components/toast/ToastProvider";
import { KeyboardAvoidingScreen } from "../../components/KeyboardAvoidingScreen";
import { BottomSheet } from "../../components/BottomSheet";

interface AgentKey {
  id: number;
  label: string | null;
  key: string;
  createdAt: string;
  isActive: boolean;
}

interface ApiConnection {
  id: number;
  name: string;
  apiKeyId: string;
  resources: string[];
  canGet: boolean;
  canPost: boolean;
  canPut: boolean;
  canPatch: boolean;
  canDelete: boolean;
  isActive: boolean;
  allOrganizations: boolean;
  lastUsedAt: string | null;
  createdAt: string;
}

interface ApiConnectionLogItem {
  id: number;
  method: string;
  path: string;
  statusCode: number;
  ip: string | null;
  occurredAt: string;
}

interface ApiConnectionDetail extends ApiConnection {
  firstUsedAt: string | null;
  lastCall: ApiConnectionLogItem | null;
  callCount: number;
}

function formatSpan(fromIso: string, toIso: string): string {
  const totalMinutes = Math.max(0, dayjs(toIso).diff(dayjs(fromIso), "minute"));
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

const API_CONNECTION_VERBS: { key: "canGet" | "canPost" | "canPut" | "canPatch" | "canDelete"; label: string }[] = [
  { key: "canGet", label: "GET" },
  { key: "canPost", label: "POST" },
  { key: "canPut", label: "PUT" },
  { key: "canPatch", label: "PATCH" },
  { key: "canDelete", label: "DELETE" },
];

// Mirrors client/src/pages/appSettings/ApiConnectionsCard.tsx's RESOURCES — "assets" has full
// CRUD, the rest are read-only (GET) regardless of which verbs the connection is granted.
const API_CONNECTION_RESOURCES: { key: string; label: string }[] = [
  { key: "assets", label: "Assets" },
  { key: "tickets", label: "Tickets" },
  { key: "stock", label: "Stock Items" },
  { key: "docs", label: "Docs & SOPs" },
  { key: "network", label: "Network Devices" },
  { key: "users", label: "Users" },
];

// Summary stats (registered / first connected / active-for / call count / last call) plus a
// scrollable list of the most recent ~50 calls — no pagination UI on mobile, unlike the web
// DataTable version, since a bottom sheet is a quick-glance surface, not a full audit screen.
function ConnectionActivitySheet({ connectionId, onClose }: { connectionId: number; onClose: () => void }) {
  const { colors, spacing } = useTheme();

  const { data: detail } = useQuery({
    queryKey: ["mobile-api-connection-detail", connectionId],
    queryFn: async () => (await axiosClient.get(`/api-connections/${connectionId}`)).data as ApiConnectionDetail,
  });

  const { data: logs, isLoading } = useQuery({
    queryKey: ["mobile-api-connection-logs", connectionId],
    queryFn: async () => (await axiosClient.get(`/api-connections/${connectionId}/logs`, { params: { pageSize: 50 } })).data as { items: ApiConnectionLogItem[] },
  });

  return (
    <BottomSheet visible onClose={onClose} title={detail?.name ?? "Connection Activity"}>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: spacing.md }}>
        <Text style={{ color: colors.textMuted, fontSize: 11 }}>
          {detail ? `Registered ${dayjs(detail.createdAt).format("DD MMM YYYY, HH:mm")}` : "…"}
        </Text>
        <Text style={{ color: colors.textMuted, fontSize: 11 }}>
          {detail?.firstUsedAt ? `First connected ${dayjs(detail.firstUsedAt).format("DD MMM YYYY, HH:mm")}` : detail ? "Never connected" : ""}
        </Text>
        {detail?.firstUsedAt && detail.lastCall && (
          <Text style={{ color: colors.textMuted, fontSize: 11 }}>Active for {formatSpan(detail.firstUsedAt, detail.lastCall.occurredAt)}</Text>
        )}
        {detail && <Text style={{ color: colors.textMuted, fontSize: 11 }}>{detail.callCount} call{detail.callCount === 1 ? "" : "s"} total</Text>}
      </View>
      {isLoading && <ActivityIndicator color={colors.primary} />}
      <FlatList
        data={logs?.items ?? []}
        keyExtractor={(item) => String(item.id)}
        style={{ maxHeight: 320 }}
        ListEmptyComponent={!isLoading ? <Text style={{ color: colors.textMuted, fontSize: 12 }}>No calls logged yet.</Text> : null}
        renderItem={({ item }) => (
          <View style={{ paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Text style={{ color: colors.text, fontSize: 12, fontWeight: "600", fontFamily: "monospace" }}>{item.method} {item.path}</Text>
              <Text style={{ color: item.statusCode < 400 ? colors.success : colors.danger, fontSize: 11, fontWeight: "700" }}>{item.statusCode}</Text>
            </View>
            <Text style={{ color: colors.textMuted, fontSize: 10.5 }}>{dayjs(item.occurredAt).format("DD MMM YYYY, HH:mm:ss")}{item.ip ? ` · ${item.ip}` : ""}</Text>
          </View>
        )}
      />
    </BottomSheet>
  );
}

// Mirrors client/src/pages/appSettings/SystemSettingsTab.tsx — general settings, password/login
// policy, network relay toggle, and agent API keys. The Change Management schedule-vs-publish-now
// workflow stays web-only; mobile always saves immediately (same simplification as Roles).
export function SystemSettingsScreen() {
  const { colors, spacing, radius } = useTheme();
  const { hasPermission, user } = useAuth();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const canEdit = hasPermission("app-settings", "edit");
  const isSystemAdmin = user?.roleName === "System Admin";

  const { data: settings } = useQuery({ queryKey: ["mobile-system-settings"], queryFn: async () => (await axiosClient.get("/settings")).data as Record<string, string> });
  const [values, setValues] = useState<Record<string, string>>({});

  useEffect(() => {
    if (settings) setValues(settings);
  }, [settings]);

  const saveMutation = useMutation({
    mutationFn: () => axiosClient.put("/settings", { values }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mobile-system-settings"] });
      showToast({ variant: "success", title: "Settings saved" });
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

  const { data: apiConnections } = useQuery({
    queryKey: ["mobile-api-connections"],
    queryFn: async () => (await axiosClient.get("/api-connections")).data as ApiConnection[],
  });
  const DEFAULT_API_CONN_FORM = { name: "", resources: ["assets"] as string[], canGet: true, canPost: false, canPut: false, canPatch: false, canDelete: false, allOrganizations: false };
  const [apiConnForm, setApiConnForm] = useState(DEFAULT_API_CONN_FORM);
  const [apiConnJustCreated, setApiConnJustCreated] = useState<{ apiKeyId: string; bearerToken: string } | null>(null);
  const createApiConnMutation = useMutation({
    mutationFn: () => axiosClient.post("/api-connections", apiConnForm),
    onSuccess: (res) => {
      setApiConnJustCreated({ apiKeyId: res.data.apiKeyId, bearerToken: res.data.bearerToken });
      setApiConnForm(DEFAULT_API_CONN_FORM);
      queryClient.invalidateQueries({ queryKey: ["mobile-api-connections"] });
    },
  });
  function toggleApiConnResource(key: string, checked: boolean) {
    setApiConnForm((f) => ({ ...f, resources: checked ? [...f.resources, key] : f.resources.filter((r) => r !== key) }));
  }
  const toggleApiConnActiveMutation = useMutation({
    mutationFn: (params: { id: number; isActive: boolean }) => axiosClient.patch(`/api-connections/${params.id}`, { isActive: params.isActive }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["mobile-api-connections"] }),
  });
  const deleteApiConnMutation = useMutation({
    mutationFn: (id: number) => axiosClient.delete(`/api-connections/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["mobile-api-connections"] }),
  });
  function confirmDeleteApiConn(c: ApiConnection) {
    Alert.alert("Delete Connection", `Delete "${c.name}"? Any app using this credential will stop working immediately.`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => deleteApiConnMutation.mutate(c.id) },
    ]);
  }
  const [activityConnectionId, setActivityConnectionId] = useState<number | null>(null);

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
    <KeyboardAvoidingScreen>
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

      <View style={panel}>
        <Text style={sectionTitle}>API Connections</Text>
        <Text style={{ color: colors.textMuted, fontSize: 11.5, marginBottom: spacing.md }}>
          Let another application call this organization's data over REST. The secret is shown once — long-press to copy it before dismissing.
        </Text>

        {apiConnJustCreated && (
          <View style={{ backgroundColor: colors.success + "22", borderRadius: radius.md, padding: 10, marginBottom: spacing.md }}>
            <Text style={{ color: colors.success, fontSize: 11.5, fontWeight: "700", marginBottom: 4 }}>Bearer token — copy it now, it won't be shown again:</Text>
            <Text selectable style={{ color: colors.text, fontSize: 11, fontFamily: "monospace" }}>{apiConnJustCreated.bearerToken}</Text>
            <TouchableOpacity onPress={() => setApiConnJustCreated(null)} style={{ marginTop: 6 }}>
              <Text style={{ color: colors.textMuted, fontSize: 11 }}>Dismiss</Text>
            </TouchableOpacity>
          </View>
        )}

        {(apiConnections ?? []).map((c) => (
          <View key={c.id} style={{ paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border }}>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.text, fontSize: 12.5, fontWeight: "600" }}>{c.name}</Text>
                <Text style={{ color: colors.textMuted, fontSize: 10.5, fontFamily: "monospace" }}>{c.apiKeyId}</Text>
              </View>
              <View style={{ backgroundColor: c.isActive ? colors.success + "22" : colors.border, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, marginRight: 8 }}>
                <Text style={{ color: c.isActive ? colors.success : colors.textMuted, fontSize: 10, fontWeight: "700" }}>{c.isActive ? "Active" : "Revoked"}</Text>
              </View>
            </View>
            {c.allOrganizations && (
              <View style={{ backgroundColor: colors.warning + "22", borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, alignSelf: "flex-start", marginTop: 6 }}>
                <Text style={{ color: colors.warning, fontSize: 10, fontWeight: "700" }}>All organizations</Text>
              </View>
            )}
            <Text style={{ color: colors.textMuted, fontSize: 10.5, marginTop: 6 }}>
              {c.resources.map((r) => API_CONNECTION_RESOURCES.find((x) => x.key === r)?.label ?? r).join(", ")}
            </Text>
            <View style={{ flexDirection: "row", gap: 10, marginTop: 8 }}>
              <TouchableOpacity onPress={() => setActivityConnectionId(c.id)}>
                <Text style={{ color: colors.text, fontSize: 11, fontWeight: "700" }}>Activity</Text>
              </TouchableOpacity>
              {canEdit && (
                <TouchableOpacity onPress={() => toggleApiConnActiveMutation.mutate({ id: c.id, isActive: !c.isActive })}>
                  <Text style={{ color: colors.primary, fontSize: 11, fontWeight: "700" }}>{c.isActive ? "Revoke" : "Reactivate"}</Text>
                </TouchableOpacity>
              )}
              {hasPermission("app-settings", "delete") && (
                <TouchableOpacity onPress={() => confirmDeleteApiConn(c)}>
                  <Text style={{ color: colors.danger, fontSize: 11, fontWeight: "700" }}>Delete</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        ))}
        {!apiConnections?.length && <Text style={{ color: colors.textMuted, fontSize: 12, marginBottom: spacing.md }}>No API connections yet.</Text>}

        {hasPermission("app-settings", "create") && (
          <View style={{ backgroundColor: colors.bg, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: 10, marginTop: spacing.md }}>
            <Text style={{ color: colors.textMuted, fontSize: 10.5, fontWeight: "700", marginBottom: 8, textTransform: "uppercase" }}>New Connection</Text>
            <TextInput
              style={{ borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 10, fontSize: 13, color: colors.text, backgroundColor: colors.surface, marginBottom: 10 }}
              placeholder="Name (e.g. Warehouse ERP sync)"
              placeholderTextColor={colors.textMuted}
              value={apiConnForm.name}
              onChangeText={(v) => setApiConnForm((f) => ({ ...f, name: v }))}
            />
            <Text style={{ color: colors.textMuted, fontSize: 10.5, fontWeight: "700", marginBottom: 6, textTransform: "uppercase" }}>Data</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12, marginBottom: 10 }}>
              {API_CONNECTION_RESOURCES.map((r) => (
                <TouchableOpacity key={r.key} style={{ flexDirection: "row", alignItems: "center", gap: 6 }} onPress={() => toggleApiConnResource(r.key, !apiConnForm.resources.includes(r.key))}>
                  <Ionicons name={apiConnForm.resources.includes(r.key) ? "checkbox" : "square-outline"} size={18} color={apiConnForm.resources.includes(r.key) ? colors.primary : colors.textMuted} />
                  <Text style={{ color: colors.text, fontSize: 12 }}>{r.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={{ color: colors.textMuted, fontSize: 10.5, fontWeight: "700", marginBottom: 6, textTransform: "uppercase" }}>Permissions</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12, marginBottom: 10 }}>
              {API_CONNECTION_VERBS.map((v) => (
                <TouchableOpacity key={v.key} style={{ flexDirection: "row", alignItems: "center", gap: 6 }} onPress={() => setApiConnForm((f) => ({ ...f, [v.key]: !f[v.key] }))}>
                  <Ionicons name={apiConnForm[v.key] ? "checkbox" : "square-outline"} size={18} color={apiConnForm[v.key] ? colors.primary : colors.textMuted} />
                  <Text style={{ color: colors.text, fontSize: 12 }}>{v.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            {isSystemAdmin && (
              <TouchableOpacity
                style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 12 }}
                onPress={() => setApiConnForm((f) => ({ ...f, allOrganizations: !f.allOrganizations }))}
              >
                <Ionicons name={apiConnForm.allOrganizations ? "checkbox" : "square-outline"} size={18} color={apiConnForm.allOrganizations ? colors.primary : colors.textMuted} />
                <Text style={{ color: colors.text, fontSize: 11.5, flex: 1 }}>Allow this connection to access all organizations (defaults to this one; a caller can target another via X-Organization-Id)</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={{ backgroundColor: colors.primary, borderRadius: radius.md, alignItems: "center", paddingVertical: 12, opacity: apiConnForm.name.trim() && apiConnForm.resources.length ? 1 : 0.5 }}
              disabled={!apiConnForm.name.trim() || !apiConnForm.resources.length || createApiConnMutation.isPending}
              onPress={() => createApiConnMutation.mutate()}
            >
              {createApiConnMutation.isPending ? <ActivityIndicator color="#fff" /> : <Text style={{ color: "#fff", fontWeight: "700", fontSize: 13 }}>Create Connection</Text>}
            </TouchableOpacity>
          </View>
        )}
      </View>
    </ScrollView>
    {activityConnectionId != null && (
      <ConnectionActivitySheet connectionId={activityConnectionId} onClose={() => setActivityConnectionId(null)} />
    )}
    </KeyboardAvoidingScreen>
  );
}
