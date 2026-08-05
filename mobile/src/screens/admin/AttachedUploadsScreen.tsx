import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ActivityIndicator, Alert, FlatList, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import dayjs from "dayjs";
import { axiosClient } from "../../api/axiosClient";
import { useTheme } from "../../theme/ThemeContext";
import { useAuth } from "../../auth/AuthContext";
import { PickerModal, PickerOption } from "../../components/PickerModal";
import { downloadAndShare } from "../../lib/downloadFile";

interface AttachedItem {
  sourceKey: string;
  id: number;
  displayName: string;
  url: string | null;
  sizeBytes: number | null;
  missing: boolean;
  createdAt: string;
}

function formatBytes(n: number | null): string {
  if (n === null) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

// Mirrors client's AttachedUploadsSection — files already uploaded through other features (asset
// photos, doc/ticket/project attachments, avatars): browse, audit, and clean up. "Preview" opens
// the native share sheet with the fetched file (same pattern as report/doc exports) rather than an
// in-app viewer, since these can be any file type.
export function AttachedUploadsScreen() {
  const { colors, spacing, radius } = useTheme();
  const { hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const [sourceKey, setSourceKey] = useState("");
  const [sourcePickerOpen, setSourcePickerOpen] = useState(false);
  const [previewingKey, setPreviewingKey] = useState<string | null>(null);

  const { data: sources } = useQuery({ queryKey: ["mobile-media-attached-sources"], queryFn: async () => (await axiosClient.get("/media-center/attached/sources")).data as { key: string; label: string }[] });
  const { data: items, isLoading } = useQuery({
    queryKey: ["mobile-media-attached", sourceKey],
    queryFn: async () => (await axiosClient.get("/media-center/attached", { params: { source: sourceKey || undefined, limit: 100 } })).data as AttachedItem[],
  });

  const deleteMutation = useMutation({
    mutationFn: (item: AttachedItem) => axiosClient.delete(`/media-center/attached/${item.sourceKey}/${item.id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["mobile-media-attached"] }),
  });

  function confirmDelete(item: AttachedItem) {
    Alert.alert("Delete attached file", `Delete "${item.displayName}"? This removes it from wherever it's currently attached and cannot be undone.`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => deleteMutation.mutate(item) },
    ]);
  }

  async function preview(item: AttachedItem) {
    const key = `${item.sourceKey}-${item.id}`;
    setPreviewingKey(key);
    try {
      if (item.url) {
        await downloadAndShare(item.url, item.displayName);
      } else {
        await downloadAndShare(`/media-center/attached/${item.sourceKey}/${item.id}/preview`, item.displayName);
      }
    } catch {
      Alert.alert("Preview failed", "Could not load this file.");
    } finally {
      setPreviewingKey(null);
    }
  }

  const sourceOptions: PickerOption[] = [{ id: "", label: "All sources" }, ...(sources ?? []).map((s) => ({ id: s.key, label: s.label }))];

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ padding: spacing.lg, paddingBottom: spacing.sm }}>
        <Text style={{ color: colors.textMuted, fontSize: 11.5, marginBottom: spacing.sm }}>
          Files already uploaded through other features (asset photos, document/ticket/project attachments, avatars).
        </Text>
        <TouchableOpacity style={{ borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 10, flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: colors.surface }} onPress={() => setSourcePickerOpen(true)}>
          <Text style={{ color: colors.text, fontSize: 13 }}>{sourceOptions.find((s) => s.id === sourceKey)?.label ?? "All sources"}</Text>
          <Ionicons name="chevron-down" size={16} color={colors.textMuted} />
        </TouchableOpacity>
      </View>

      {isLoading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />
      ) : (
        <FlatList
          data={items ?? []}
          keyExtractor={(item) => `${item.sourceKey}-${item.id}`}
          contentContainerStyle={{ padding: spacing.lg, paddingTop: 0, gap: spacing.sm }}
          ListEmptyComponent={<Text style={{ color: colors.textMuted, textAlign: "center", marginTop: 24 }}>No attached files found.</Text>}
          renderItem={({ item }) => {
            const key = `${item.sourceKey}-${item.id}`;
            return (
              <View style={{ backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.text, fontSize: 13, fontWeight: "700" }} numberOfLines={1}>{item.displayName}</Text>
                    <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 2 }}>
                      {sources?.find((s) => s.key === item.sourceKey)?.label ?? item.sourceKey} · {formatBytes(item.sizeBytes)} · {dayjs(item.createdAt).format("DD MMM YYYY")}
                    </Text>
                    {item.missing && (
                      <View style={{ backgroundColor: colors.danger + "22", borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, alignSelf: "flex-start", marginTop: 4 }}>
                        <Text style={{ color: colors.danger, fontSize: 10, fontWeight: "700" }}>File missing on disk</Text>
                      </View>
                    )}
                  </View>
                </View>
                <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
                  {!item.missing && (
                    <TouchableOpacity style={{ flexDirection: "row", alignItems: "center", gap: 4, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 10, paddingVertical: 6 }} disabled={previewingKey === key} onPress={() => preview(item)}>
                      {previewingKey === key ? <ActivityIndicator size="small" color={colors.text} /> : <Ionicons name="eye-outline" size={13} color={colors.text} />}
                      <Text style={{ color: colors.text, fontSize: 11, fontWeight: "700" }}>Preview</Text>
                    </TouchableOpacity>
                  )}
                  {hasPermission("app-settings", "delete") && (
                    <TouchableOpacity style={{ borderWidth: 1, borderColor: colors.danger, borderRadius: radius.md, paddingHorizontal: 10, paddingVertical: 6 }} onPress={() => confirmDelete(item)}>
                      <Text style={{ color: colors.danger, fontSize: 11, fontWeight: "700" }}>Delete</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            );
          }}
        />
      )}
      <PickerModal visible={sourcePickerOpen} title="Source" options={sourceOptions} selectedId={sourceKey} onSelect={(v) => setSourceKey((v as string) ?? "")} onClose={() => setSourcePickerOpen(false)} />
    </View>
  );
}
