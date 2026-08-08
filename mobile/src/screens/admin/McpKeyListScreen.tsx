import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ActivityIndicator, FlatList, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import dayjs from "dayjs";
import { axiosClient } from "../../api/axiosClient";
import { useTheme } from "../../theme/ThemeContext";
import { BottomSheet } from "../../components/BottomSheet";
import { ShimmerList } from "../../components/Shimmer";

interface McpKey {
  id: number;
  key: string;
  label: string | null;
  isActive: boolean;
  lastUsedAt: string | null;
  lastUsedIp: string | null;
  createdAt: string;
}

interface McpAccessLogItem {
  id: number;
  toolName: string;
  args: Record<string, unknown> | null;
  ok: boolean;
  occurredAt: string;
}

interface McpKeyDetail extends McpKey {
  firstUsedAt: string | null;
  lastCall: McpAccessLogItem | null;
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

// Same Activity bottom sheet pattern as the API Connections screen (ConnectionActivitySheet in
// SystemSettingsScreen.tsx) — summary stats + the most recent 50 tool calls, no full pagination on
// mobile.
function KeyActivitySheet({ keyId, onClose }: { keyId: number; onClose: () => void }) {
  const { colors, spacing } = useTheme();

  const { data: detail } = useQuery({
    queryKey: ["mobile-mcp-key-detail", keyId],
    queryFn: async () => (await axiosClient.get(`/mcp-keys/${keyId}`)).data as McpKeyDetail,
  });

  const { data: logs, isLoading } = useQuery({
    queryKey: ["mobile-mcp-key-logs", keyId],
    queryFn: async () => (await axiosClient.get(`/mcp-keys/${keyId}/logs`, { params: { pageSize: 50 } })).data as { items: McpAccessLogItem[] },
  });

  return (
    <BottomSheet visible onClose={onClose} title={detail?.label ?? "MCP Key Activity"}>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: spacing.md }}>
        <Text style={{ color: colors.textMuted, fontSize: 11 }}>{detail ? `Registered ${dayjs(detail.createdAt).format("DD MMM YYYY, HH:mm")}` : "…"}</Text>
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
              <Text style={{ color: colors.text, fontSize: 12, fontWeight: "600", fontFamily: "monospace" }}>{item.toolName}</Text>
              <Text style={{ color: item.ok ? colors.success : colors.danger, fontSize: 11, fontWeight: "700" }}>{item.ok ? "OK" : "Error"}</Text>
            </View>
            <Text style={{ color: colors.textMuted, fontSize: 10.5 }}>{dayjs(item.occurredAt).format("DD MMM YYYY, HH:mm:ss")}</Text>
          </View>
        )}
      />
    </BottomSheet>
  );
}

function maskKey(key: string): string {
  if (key.length <= 8) return "•".repeat(key.length);
  return `${"•".repeat(key.length - 6)}${key.slice(-6)}`;
}

// Mirrors client/src/pages/appSettings/McpConnectionCard.tsx — self-service MCP API key management
// (acts as the owning user's account for AI-tool access, so treat like a password).
export function McpKeyListScreen() {
  const { colors, spacing, radius } = useTheme();
  const queryClient = useQueryClient();
  const [justCreatedKey, setJustCreatedKey] = useState<string | null>(null);
  const [activityKeyId, setActivityKeyId] = useState<number | null>(null);

  const { data: keys, isLoading } = useQuery({
    queryKey: ["mobile-mcp-keys"],
    queryFn: async () => (await axiosClient.get("/mcp-keys")).data as McpKey[],
  });

  const createMutation = useMutation({
    mutationFn: () => axiosClient.post("/mcp-keys", { label: "My MCP Key" }),
    onSuccess: (res) => {
      setJustCreatedKey(res.data.key);
      queryClient.invalidateQueries({ queryKey: ["mobile-mcp-keys"] });
    },
  });

  const toggleMutation = useMutation({
    mutationFn: (params: { id: number; isActive: boolean }) => axiosClient.patch(`/mcp-keys/${params.id}`, { isActive: params.isActive }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["mobile-mcp-keys"] }),
  });

  const regenerateMutation = useMutation({
    mutationFn: async (id: number) => {
      await axiosClient.patch(`/mcp-keys/${id}`, { isActive: false });
      return axiosClient.post("/mcp-keys", { label: "My MCP Key" });
    },
    onSuccess: (res) => {
      setJustCreatedKey(res.data.key);
      queryClient.invalidateQueries({ queryKey: ["mobile-mcp-keys"] });
    },
  });

  if (isLoading) return <ShimmerList />;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <FlatList
        data={keys ?? []}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm }}
        ListHeaderComponent={
          <View style={{ marginBottom: spacing.md, gap: 10 }}>
            <Text style={{ color: colors.textMuted, fontSize: 12 }}>
              Connect an MCP-compatible AI tool (Claude Desktop, Claude Code) to this app's data using this key. It acts as
              your account, so treat it like a password — revoke it if it's ever exposed.
            </Text>
            <TouchableOpacity
              style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingVertical: 12 }}
              disabled={createMutation.isPending}
              onPress={() => createMutation.mutate()}
            >
              <Ionicons name="add" size={16} color={colors.text} />
              <Text style={{ color: colors.text, fontWeight: "700", fontSize: 13 }}>Generate Key</Text>
            </TouchableOpacity>
            {justCreatedKey && (
              <View style={{ backgroundColor: colors.success + "18", borderRadius: radius.md, padding: 10 }}>
                <Text style={{ color: colors.success, fontSize: 11.5, fontWeight: "700", marginBottom: 4 }}>Your new key (shown once, long-press to copy):</Text>
                <Text selectable style={{ color: colors.text, fontSize: 11, fontFamily: "monospace" }}>{justCreatedKey}</Text>
                <TouchableOpacity onPress={() => setJustCreatedKey(null)} style={{ marginTop: 6 }}>
                  <Text style={{ color: colors.textMuted, fontSize: 11 }}>Dismiss</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        }
        ListEmptyComponent={<Text style={{ color: colors.textMuted, textAlign: "center" }}>No MCP keys yet.</Text>}
        renderItem={({ item: k }) => (
          <View style={{ backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, marginBottom: 6 }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <Text selectable style={{ color: colors.text, fontSize: 12, fontFamily: "monospace" }}>{maskKey(k.key)}</Text>
              <View style={{ backgroundColor: k.isActive ? colors.success + "22" : colors.border, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 }}>
                <Text style={{ color: k.isActive ? colors.success : colors.textMuted, fontSize: 10, fontWeight: "700" }}>{k.isActive ? "Active" : "Revoked"}</Text>
              </View>
            </View>
            <Text style={{ color: colors.textMuted, fontSize: 10.5, marginTop: 4 }}>{k.lastUsedAt ? `Last used ${dayjs(k.lastUsedAt).format("DD MMM, HH:mm")}` : "Never used"}</Text>
            <View style={{ flexDirection: "row", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
              <TouchableOpacity style={{ borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 10, paddingVertical: 6 }} onPress={() => setActivityKeyId(k.id)}>
                <Text style={{ color: colors.text, fontSize: 11, fontWeight: "700" }}>Activity</Text>
              </TouchableOpacity>
              {k.isActive && (
                <TouchableOpacity style={{ borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 10, paddingVertical: 6 }} disabled={regenerateMutation.isPending} onPress={() => regenerateMutation.mutate(k.id)}>
                  <Text style={{ color: colors.text, fontSize: 11, fontWeight: "700" }}>Regenerate</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={{ borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 10, paddingVertical: 6 }} onPress={() => toggleMutation.mutate({ id: k.id, isActive: !k.isActive })}>
                <Text style={{ color: colors.text, fontSize: 11, fontWeight: "700" }}>{k.isActive ? "Revoke" : "Reactivate"}</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      />
      {activityKeyId != null && <KeyActivitySheet keyId={activityKeyId} onClose={() => setActivityKeyId(null)} />}
    </View>
  );
}
