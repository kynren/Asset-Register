import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FlatList, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import dayjs from "dayjs";
import { axiosClient } from "../../api/axiosClient";
import { useTheme } from "../../theme/ThemeContext";
import { BottomSheet } from "../../components/BottomSheet";
import { ShimmerList } from "../../components/Shimmer";

interface ExternalConnector {
  id: number;
  name: string;
  baseUrl: string;
  authHeaderName: string;
  direction: "PUSH" | "PULL" | "BOTH";
  resources: string[];
  isEnabled: boolean;
  lastPulledAt: string | null;
  createdAt: string;
}

interface ExternalConnectorLogItem {
  id: number;
  direction: string;
  ok: boolean;
  statusCode: number | null;
  recordCounts: Record<string, number> | null;
  error: string | null;
  occurredAt: string;
}

interface ExternalConnectorDetail extends ExternalConnector {
  firstUsedAt: string | null;
  lastCall: ExternalConnectorLogItem | null;
  callCount: number;
}

// Same resource vocabulary as ApiConnectionsCard/ExternalConnectorsCard on web — the opposite
// direction of the API Connections gateway, reusing the same picker.
const RESOURCES: { key: string; label: string }[] = [
  { key: "assets", label: "Assets" },
  { key: "tickets", label: "Tickets" },
  { key: "stock", label: "Stock Items" },
  { key: "docs", label: "Docs & SOPs" },
  { key: "network", label: "Network Devices" },
  { key: "users", label: "Users" },
];

function formatSpan(fromIso: string, toIso: string): string {
  const totalMinutes = Math.max(0, dayjs(toIso).diff(dayjs(fromIso), "minute"));
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function ConnectorActivitySheet({ connectorId, onClose }: { connectorId: number; onClose: () => void }) {
  const { colors, spacing } = useTheme();

  const { data: detail } = useQuery({
    queryKey: ["mobile-external-connector-detail", connectorId],
    queryFn: async () => (await axiosClient.get(`/external-connectors/${connectorId}`)).data as ExternalConnectorDetail,
  });
  const { data: logs, isLoading } = useQuery({
    queryKey: ["mobile-external-connector-logs", connectorId],
    queryFn: async () => (await axiosClient.get(`/external-connectors/${connectorId}/logs`, { params: { pageSize: 50 } })).data as { items: ExternalConnectorLogItem[] },
  });

  return (
    <BottomSheet visible onClose={onClose} title={detail?.name ?? "Connector Activity"}>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: spacing.md }}>
        <Text style={{ color: colors.textMuted, fontSize: 11 }}>{detail ? `Registered ${dayjs(detail.createdAt).format("DD MMM YYYY, HH:mm")}` : "…"}</Text>
        {detail?.firstUsedAt && detail.lastCall && (
          <Text style={{ color: colors.textMuted, fontSize: 11 }}>Active for {formatSpan(detail.firstUsedAt, detail.lastCall.occurredAt)}</Text>
        )}
        {detail && <Text style={{ color: colors.textMuted, fontSize: 11 }}>{detail.callCount} attempt{detail.callCount === 1 ? "" : "s"}</Text>}
      </View>
      <FlatList
        data={logs?.items ?? []}
        keyExtractor={(item) => String(item.id)}
        style={{ maxHeight: 320 }}
        ListEmptyComponent={!isLoading ? <Text style={{ color: colors.textMuted, fontSize: 12 }}>No attempts logged yet.</Text> : null}
        renderItem={({ item }) => (
          <View style={{ paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Text style={{ color: colors.text, fontSize: 12, fontWeight: "600" }}>
                {item.ok ? Object.entries(item.recordCounts ?? {}).map(([k, v]) => `${v} ${k}`).join(", ") || "OK" : "Failed"}
              </Text>
              <Text style={{ color: item.ok ? colors.success : colors.danger, fontSize: 11, fontWeight: "700" }}>{item.statusCode ?? "—"}</Text>
            </View>
            <Text style={{ color: colors.textMuted, fontSize: 10.5 }}>{dayjs(item.occurredAt).format("DD MMM YYYY, HH:mm:ss")}{item.error ? ` · ${item.error}` : ""}</Text>
          </View>
        )}
      />
    </BottomSheet>
  );
}

function ConnectorRecordsSheet({ connector, onClose }: { connector: ExternalConnector; onClose: () => void }) {
  const { colors, spacing } = useTheme();
  const [store, setStore] = useState(connector.resources[0] ?? "");

  const { data: records, isLoading } = useQuery({
    queryKey: ["mobile-external-connector-records", connector.id, store],
    enabled: !!store,
    queryFn: async () => (await axiosClient.get(`/external-connectors/${connector.id}/records`, { params: { store, pageSize: 30 } })).data as { items: { id: number; externalId: string | null; data: unknown; pulledAt: string }[] },
  });

  return (
    <BottomSheet visible onClose={onClose} title={`${connector.name} — Records`}>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: spacing.md }}>
        {connector.resources.map((r) => {
          const active = store === r;
          return (
            <TouchableOpacity
              key={r}
              onPress={() => setStore(r)}
              style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: active ? colors.primary : colors.surface, borderWidth: 1, borderColor: active ? colors.primary : colors.border }}
            >
              <Text style={{ color: active ? "#fff" : colors.text, fontSize: 11.5, fontWeight: "600" }}>{RESOURCES.find((x) => x.key === r)?.label ?? r}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      <FlatList
        data={records?.items ?? []}
        keyExtractor={(item) => String(item.id)}
        style={{ maxHeight: 340 }}
        ListEmptyComponent={!isLoading ? <Text style={{ color: colors.textMuted, fontSize: 12 }}>No records pulled yet.</Text> : null}
        renderItem={({ item }) => (
          <View style={{ paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border }}>
            <Text style={{ color: colors.text, fontSize: 11, fontFamily: "monospace" }} numberOfLines={3}>{JSON.stringify(item.data)}</Text>
            <Text style={{ color: colors.textMuted, fontSize: 10, marginTop: 3 }}>
              {item.externalId ? `#${item.externalId} · ` : ""}{dayjs(item.pulledAt).format("DD MMM YYYY, HH:mm")}
            </Text>
          </View>
        )}
      />
    </BottomSheet>
  );
}

const DEFAULT_FORM = { name: "", baseUrl: "", authHeaderName: "Authorization", authHeaderValue: "", resources: [] as string[] };

// Mirrors client/src/pages/appSettings/ExternalConnectorsCard.tsx — the inverse of API
// Connections: this app calls out to another system's API and pulls its data in.
export function ExternalConnectorListScreen() {
  const { colors, spacing, radius } = useTheme();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(DEFAULT_FORM);
  const [activityConnectorId, setActivityConnectorId] = useState<number | null>(null);
  const [recordsConnector, setRecordsConnector] = useState<ExternalConnector | null>(null);
  const [status, setStatus] = useState<Record<number, string>>({});

  const { data: connectors, isLoading } = useQuery({
    queryKey: ["mobile-external-connectors"],
    queryFn: async () => (await axiosClient.get("/external-connectors")).data as ExternalConnector[],
  });

  const createMutation = useMutation({
    mutationFn: () => axiosClient.post("/external-connectors", { ...form, direction: "PULL" }),
    onSuccess: () => {
      setForm(DEFAULT_FORM);
      setShowForm(false);
      queryClient.invalidateQueries({ queryKey: ["mobile-external-connectors"] });
    },
  });
  const toggleMutation = useMutation({
    mutationFn: (params: { id: number; isEnabled: boolean }) => axiosClient.patch(`/external-connectors/${params.id}`, { isEnabled: params.isEnabled }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["mobile-external-connectors"] }),
  });
  const deleteMutation = useMutation({
    mutationFn: (id: number) => axiosClient.delete(`/external-connectors/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["mobile-external-connectors"] }),
  });
  const testMutation = useMutation({
    mutationFn: async (id: number) => ({ id, ...(await axiosClient.post(`/external-connectors/${id}/test`)).data }),
    onSuccess: (res) => setStatus((s) => ({ ...s, [res.id]: res.ok ? `✓ Reachable (HTTP ${res.statusCode})` : `✕ ${res.error ?? `HTTP ${res.statusCode}`}` })),
  });
  const pullMutation = useMutation({
    mutationFn: async (id: number) => {
      try {
        return { id, ...(await axiosClient.post(`/external-connectors/${id}/pull`)).data };
      } catch (err: any) {
        return { id, ok: false, error: err?.response?.data?.error ?? "Pull failed." };
      }
    },
    onSuccess: (res) => {
      setStatus((s) => ({
        ...s,
        [res.id]: res.ok ? `✓ Pulled ${Object.entries(res.recordCounts ?? {}).map(([k, v]) => `${v} ${k}`).join(", ") || "0 records"}` : `✕ ${res.error}`,
      }));
      queryClient.invalidateQueries({ queryKey: ["mobile-external-connectors"] });
    },
  });

  function toggleResource(key: string) {
    setForm((f) => ({ ...f, resources: f.resources.includes(key) ? f.resources.filter((r) => r !== key) : [...f.resources, key] }));
  }

  const inputStyle = { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: colors.text, backgroundColor: colors.surface };

  if (isLoading) return <ShimmerList />;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <FlatList
        data={connectors ?? []}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm }}
        ListHeaderComponent={
          <View style={{ marginBottom: spacing.md, gap: 10 }}>
            <Text style={{ color: colors.textMuted, fontSize: 12 }}>
              Connect this organization's data to another app over its API — pull records in on demand.
            </Text>
            {!showForm ? (
              <TouchableOpacity style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingVertical: 12 }} onPress={() => setShowForm(true)}>
                <Ionicons name="add" size={16} color={colors.text} />
                <Text style={{ color: colors.text, fontWeight: "700", fontSize: 13 }}>New Connector</Text>
              </TouchableOpacity>
            ) : (
              <View style={{ backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, gap: 8 }}>
                <TextInput style={inputStyle} placeholder="Name" placeholderTextColor={colors.textMuted} value={form.name} onChangeText={(v) => setForm((f) => ({ ...f, name: v }))} />
                <TextInput style={inputStyle} placeholder="Base URL" placeholderTextColor={colors.textMuted} autoCapitalize="none" value={form.baseUrl} onChangeText={(v) => setForm((f) => ({ ...f, baseUrl: v }))} />
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <TextInput style={[inputStyle, { flex: 1 }]} placeholder="Auth header name" placeholderTextColor={colors.textMuted} value={form.authHeaderName} onChangeText={(v) => setForm((f) => ({ ...f, authHeaderName: v }))} />
                  <TextInput style={[inputStyle, { flex: 2 }]} placeholder="Auth header value" placeholderTextColor={colors.textMuted} secureTextEntry value={form.authHeaderValue} onChangeText={(v) => setForm((f) => ({ ...f, authHeaderValue: v }))} />
                </View>
                <Text style={{ color: colors.textMuted, fontSize: 10.5, fontWeight: "700", textTransform: "uppercase" }}>Pull into</Text>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
                  {RESOURCES.map((r) => (
                    <TouchableOpacity key={r.key} style={{ flexDirection: "row", alignItems: "center", gap: 6 }} onPress={() => toggleResource(r.key)}>
                      <Ionicons name={form.resources.includes(r.key) ? "checkbox" : "square-outline"} size={18} color={form.resources.includes(r.key) ? colors.primary : colors.textMuted} />
                      <Text style={{ color: colors.text, fontSize: 12 }}>{r.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <TouchableOpacity style={{ flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, alignItems: "center", paddingVertical: 10 }} onPress={() => { setShowForm(false); setForm(DEFAULT_FORM); }}>
                    <Text style={{ color: colors.text, fontWeight: "700", fontSize: 12.5 }}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={{ flex: 1, backgroundColor: colors.primary, borderRadius: radius.md, alignItems: "center", paddingVertical: 10, opacity: form.name.trim() && form.baseUrl.trim() && form.authHeaderValue.trim() && form.resources.length ? 1 : 0.5 }}
                    disabled={!form.name.trim() || !form.baseUrl.trim() || !form.authHeaderValue.trim() || !form.resources.length || createMutation.isPending}
                    onPress={() => createMutation.mutate()}
                  >
                    <Text style={{ color: "#fff", fontWeight: "700", fontSize: 12.5 }}>Create</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>
        }
        ListEmptyComponent={<Text style={{ color: colors.textMuted, textAlign: "center" }}>No connectors yet.</Text>}
        renderItem={({ item: c }) => (
          <View style={{ backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, marginBottom: 6 }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <Text style={{ color: colors.text, fontSize: 13, fontWeight: "700", flex: 1 }} numberOfLines={1}>{c.name}</Text>
              <View style={{ backgroundColor: c.isEnabled ? colors.success + "22" : colors.border, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 }}>
                <Text style={{ color: c.isEnabled ? colors.success : colors.textMuted, fontSize: 10, fontWeight: "700" }}>{c.isEnabled ? "Enabled" : "Disabled"}</Text>
              </View>
            </View>
            <Text style={{ color: colors.textMuted, fontSize: 10.5, marginTop: 2 }} numberOfLines={1}>{c.baseUrl}</Text>
            <Text style={{ color: colors.textMuted, fontSize: 10.5, marginTop: 4 }}>
              {c.resources.map((r) => RESOURCES.find((x) => x.key === r)?.label ?? r).join(", ")}
              {c.lastPulledAt ? ` · Last pulled ${dayjs(c.lastPulledAt).format("DD MMM, HH:mm")}` : " · Never pulled"}
            </Text>
            {status[c.id] && <Text style={{ color: status[c.id].startsWith("✓") ? colors.success : colors.danger, fontSize: 11, marginTop: 6 }}>{status[c.id]}</Text>}
            <View style={{ flexDirection: "row", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
              <TouchableOpacity style={{ borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 10, paddingVertical: 6 }} onPress={() => setActivityConnectorId(c.id)}>
                <Text style={{ color: colors.text, fontSize: 11, fontWeight: "700" }}>Activity</Text>
              </TouchableOpacity>
              <TouchableOpacity style={{ borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 10, paddingVertical: 6 }} onPress={() => setRecordsConnector(c)}>
                <Text style={{ color: colors.text, fontSize: 11, fontWeight: "700" }}>Records</Text>
              </TouchableOpacity>
              <TouchableOpacity style={{ borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 10, paddingVertical: 6 }} disabled={testMutation.isPending} onPress={() => testMutation.mutate(c.id)}>
                <Text style={{ color: colors.text, fontSize: 11, fontWeight: "700" }}>Test</Text>
              </TouchableOpacity>
              <TouchableOpacity style={{ backgroundColor: colors.primary, borderRadius: radius.md, paddingHorizontal: 10, paddingVertical: 6, opacity: c.isEnabled ? 1 : 0.5 }} disabled={!c.isEnabled || pullMutation.isPending} onPress={() => pullMutation.mutate(c.id)}>
                <Text style={{ color: "#fff", fontSize: 11, fontWeight: "700" }}>Pull Now</Text>
              </TouchableOpacity>
              <TouchableOpacity style={{ borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 10, paddingVertical: 6 }} onPress={() => toggleMutation.mutate({ id: c.id, isEnabled: !c.isEnabled })}>
                <Text style={{ color: colors.text, fontSize: 11, fontWeight: "700" }}>{c.isEnabled ? "Disable" : "Enable"}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={{ borderWidth: 1, borderColor: colors.danger, borderRadius: radius.md, paddingHorizontal: 10, paddingVertical: 6 }} onPress={() => deleteMutation.mutate(c.id)}>
                <Text style={{ color: colors.danger, fontSize: 11, fontWeight: "700" }}>Delete</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      />
      {activityConnectorId != null && <ConnectorActivitySheet connectorId={activityConnectorId} onClose={() => setActivityConnectorId(null)} />}
      {recordsConnector && <ConnectorRecordsSheet connector={recordsConnector} onClose={() => setRecordsConnector(null)} />}
    </View>
  );
}
