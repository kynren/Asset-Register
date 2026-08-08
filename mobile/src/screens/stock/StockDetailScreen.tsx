import { useLayoutEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { ActivityIndicator, Alert, Image, ScrollView, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import QRCode from "react-native-qrcode-svg";
import dayjs from "dayjs";
import { axiosClient } from "../../api/axiosClient";
import { API_ORIGIN } from "../../config/env";
import { useAuth } from "../../auth/AuthContext";
import { useTheme } from "../../theme/ThemeContext";
import { ShimmerDetail } from "../../components/Shimmer";
import { CommentThread } from "../../components/CommentThread";
import { useToast } from "../../components/toast/ToastProvider";
import { StockItem } from "../../types/stock";
import { StockStackParamList } from "../../navigation/types";
import { buildMediaFormData, isVideo, pickAssetMedia } from "../../lib/mediaPicker";
import { useCustomColumns } from "../../hooks/useCustomColumns";

const TRANSACTION_ICON: Record<string, keyof typeof Ionicons.glyphMap> = {
  IN: "arrow-down-circle",
  OUT: "arrow-up-circle",
  TRANSFER: "swap-horizontal",
};

export function StockDetailScreen() {
  const { colors, spacing, radius } = useTheme();
  const { hasPermission } = useAuth();
  const { showToast } = useToast();
  const navigation = useNavigation<NativeStackNavigationProp<StockStackParamList>>();
  const route = useRoute<RouteProp<StockStackParamList, "StockDetail">>();
  const { id } = route.params;
  const queryClient = useQueryClient();

  const { data: item, isLoading } = useQuery({
    queryKey: ["mobile-stock-item", id],
    queryFn: async () => (await axiosClient.get(`/stock/${id}`)).data as StockItem,
  });

  const [uploadingAttachment, setUploadingAttachment] = useState(false);

  const deleteMutation = useMutation({
    mutationFn: () => axiosClient.delete(`/stock/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mobile-stock"] });
      navigation.goBack();
    },
  });

  const uploadAttachmentMutation = useMutation({
    mutationFn: (media: Awaited<ReturnType<typeof pickAssetMedia>>[number]) =>
      axiosClient.post(`/stock/${id}/attachments`, buildMediaFormData(media), { headers: { "Content-Type": "multipart/form-data" } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["mobile-stock-item", id] }),
  });

  const deleteAttachmentMutation = useMutation({
    mutationFn: (attachmentId: number) => axiosClient.delete(`/stock/${id}/attachments/${attachmentId}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["mobile-stock-item", id] }),
  });

  async function addAttachment(useCamera: boolean) {
    const picked = await pickAssetMedia(useCamera);
    if (!picked.length) return;
    setUploadingAttachment(true);
    try {
      for (const media of picked) await uploadAttachmentMutation.mutateAsync(media);
    } catch {
      showToast({ variant: "error", title: "Upload failed", message: "Couldn't upload one or more files." });
    } finally {
      setUploadingAttachment(false);
    }
  }

  function promptAddAttachment() {
    Alert.alert("Add photo or video", undefined, [
      { text: "Take Photo/Video", onPress: () => addAttachment(true) },
      { text: "Choose from Library", onPress: () => addAttachment(false) },
      { text: "Cancel", style: "cancel" },
    ]);
  }

  function confirmDelete() {
    Alert.alert("Delete stock item", `Delete "${item?.name}"? This can't be undone.`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => deleteMutation.mutate() },
    ]);
  }

  useLayoutEffect(() => {
    navigation.setOptions({
      title: item?.name ?? "Stock Item",
      headerRight: () =>
        hasPermission("stock", "edit") ? (
          <TouchableOpacity onPress={() => navigation.navigate("StockForm", { id })} style={{ paddingHorizontal: 4 }}>
            <Ionicons name="create-outline" size={22} color={colors.primary} />
          </TouchableOpacity>
        ) : null,
    });
  }, [navigation, item, id, colors.primary]);

  if (isLoading || !item) {
    return <ShimmerDetail />;
  }

  const low = item.quantityOnHand <= item.reorderLevel;
  const rows: [string, string | null][] = [
    ["Type / Category", item.stockItemType?.name ?? item.category ?? "—"],
    ["Unit", item.unit],
    ["Reorder level", `${item.reorderLevel} ${item.unit}`],
    ["Unit cost", item.unitCost != null ? `£${item.unitCost}` : null],
  ];

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: spacing.lg }}>
      <View style={{ alignItems: "center", backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, marginBottom: spacing.lg }}>
        <QRCode value={item.sku} size={140} backgroundColor={colors.surface} color={colors.text} />
        <Text style={{ color: colors.text, fontSize: 16, fontWeight: "800", marginTop: spacing.md }}>{item.name}</Text>
        <Text style={{ color: colors.textMuted, fontSize: 13, marginTop: 2 }}>{item.sku}</Text>
        <Text style={{ color: low ? colors.danger : colors.success, fontSize: 22, fontWeight: "800", marginTop: spacing.sm }}>
          {item.quantityOnHand} {item.unit}
        </Text>
        {low && <Text style={{ color: colors.danger, fontSize: 11, fontWeight: "700" }}>LOW STOCK — reorder soon</Text>}
      </View>

      {hasPermission("stock", "edit") && (
        <View style={{ flexDirection: "row", gap: 8, marginBottom: spacing.lg }}>
          <TouchableOpacity
            style={{ flex: 1, backgroundColor: colors.primary, borderRadius: radius.md, alignItems: "center", paddingVertical: 13 }}
            onPress={() => navigation.navigate("StockIssue", { id })}
          >
            <Text style={{ color: "#fff", fontWeight: "700" }}>Issue Stock</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={{ flex: 1, borderWidth: 1.5, borderColor: colors.primary, borderRadius: radius.md, alignItems: "center", paddingVertical: 13 }}
            onPress={() => navigation.navigate("StockAdjust", { id })}
          >
            <Text style={{ color: colors.primary, fontWeight: "700" }}>Adjust (in/out)</Text>
          </TouchableOpacity>
        </View>
      )}

      <View style={{ backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.lg }}>
        {rows
          .filter(([, v]) => v !== null)
          .map(([label, value], i, arr) => (
            <View key={label} style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 12, borderBottomWidth: i < arr.length - 1 ? 1 : 0, borderBottomColor: colors.border }}>
              <Text style={{ color: colors.textMuted, fontSize: 13 }}>{label}</Text>
              <Text style={{ color: colors.text, fontSize: 13, fontWeight: "600" }}>{value}</Text>
            </View>
          ))}
      </View>

      {!!item.stockLevels?.length && (
        <View style={{ marginTop: spacing.lg, backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.lg }}>
          <Text style={{ color: colors.textMuted, fontSize: 12, fontWeight: "700", textTransform: "uppercase", paddingTop: 12 }}>Stock by location</Text>
          {item.stockLevels.map((lvl, i, arr) => (
            <View key={lvl.id} style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 12, borderBottomWidth: i < arr.length - 1 ? 1 : 0, borderBottomColor: colors.border }}>
              <Text style={{ color: colors.text, fontSize: 13 }}>{lvl.location.name}</Text>
              <Text style={{ color: colors.text, fontSize: 13, fontWeight: "600" }}>{lvl.quantityOnHand} {item.unit}</Text>
            </View>
          ))}
        </View>
      )}

      <CustomFieldsSection item={item} canEdit={hasPermission("stock", "edit")} />

      <View style={{ marginTop: spacing.lg }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <Text style={{ color: colors.textMuted, fontSize: 12, fontWeight: "700", textTransform: "uppercase" }}>Photos & videos</Text>
          <TouchableOpacity onPress={promptAddAttachment} disabled={uploadingAttachment}>
            {uploadingAttachment ? <ActivityIndicator size="small" color={colors.primary} /> : <Ionicons name="add-circle-outline" size={20} color={colors.primary} />}
          </TouchableOpacity>
        </View>
        {(item.attachments?.length ?? 0) === 0 && <Text style={{ color: colors.textMuted, fontSize: 12 }}>No images or video attached yet.</Text>}
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
          {(item.attachments ?? []).map((a) => (
            <View key={a.id} style={{ width: 76, height: 76 }}>
              {isVideo(a.url) ? (
                <View style={{ width: 76, height: 76, borderRadius: radius.md, backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" }}>
                  <Ionicons name="videocam" size={22} color={colors.textMuted} />
                </View>
              ) : (
                <Image source={{ uri: `${API_ORIGIN}${a.url}` }} style={{ width: 76, height: 76, borderRadius: radius.md }} />
              )}
              <TouchableOpacity
                style={{ position: "absolute", top: -6, right: -6, backgroundColor: colors.danger, borderRadius: 10, width: 20, height: 20, alignItems: "center", justifyContent: "center" }}
                onPress={() => deleteAttachmentMutation.mutate(a.id)}
              >
                <Ionicons name="close" size={13} color="#fff" />
              </TouchableOpacity>
            </View>
          ))}
        </View>
      </View>

      {!!item.transactions?.length && (
        <View style={{ marginTop: spacing.lg }}>
          <Text style={{ color: colors.textMuted, fontSize: 12, fontWeight: "700", textTransform: "uppercase", marginBottom: 8 }}>Recent activity</Text>
          {item.transactions.slice(0, 10).map((t) => (
            <View key={t.id} style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border }}>
              <View style={{ flex: 1, marginRight: 8 }}>
                <Text style={{ color: colors.text, fontSize: 13, fontWeight: "600" }}>
                  {t.type === "IN" ? "+" : t.type === "OUT" ? "-" : "↔"}
                  {t.quantity} {item.unit}
                  {t.reason ? ` · ${t.reason}` : ""}
                </Text>
                <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 2 }}>
                  {t.performedBy ? `${t.performedBy.firstName} ${t.performedBy.lastName} · ` : ""}
                  {dayjs(t.createdAt).format("DD MMM YYYY HH:mm")}
                </Text>
                {t.issuance && (
                  <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 2 }}>
                    Issued to {t.issuance.receivedBy.firstName} {t.issuance.receivedBy.lastName}
                  </Text>
                )}
              </View>
              <Ionicons name={TRANSACTION_ICON[t.type] ?? "swap-horizontal"} size={20} color={t.type === "IN" ? colors.success : t.type === "OUT" ? colors.warning : colors.primary} />
            </View>
          ))}
        </View>
      )}

      <View style={{ marginTop: spacing.lg }}>
        <Text style={{ color: colors.textMuted, fontSize: 12, fontWeight: "700", textTransform: "uppercase", marginBottom: 8 }}>Comments</Text>
        <CommentThread entityType="StockItem" entityId={item.id} />
      </View>

      {hasPermission("stock", "delete") && (
        <TouchableOpacity
          style={{ marginTop: spacing.xl, borderWidth: 1.5, borderColor: colors.danger, borderRadius: radius.md, alignItems: "center", paddingVertical: 14 }}
          onPress={confirmDelete}
          disabled={deleteMutation.isPending}
        >
          <Text style={{ color: colors.danger, fontWeight: "700" }}>Delete stock item</Text>
        </TouchableOpacity>
      )}
    </ScrollView>
  );
}

// Mirrors buildCustomColumnDefs.tsx's inline-editable table cells, flattened into a list section
// since mobile detail screens are card-based rather than tabular. Column management (add/remove
// column definitions) lives on the Stock hub's Custom Columns sheet — this only edits values.
function CustomFieldsSection({ item, canEdit }: { item: StockItem; canEdit: boolean }) {
  const { colors, spacing, radius } = useTheme();
  const { columns, setValueMutation } = useCustomColumns("StockItem");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draft, setDraft] = useState("");

  if (columns.length === 0) return null;

  return (
    <View style={{ marginTop: spacing.lg, backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.lg }}>
      <Text style={{ color: colors.textMuted, fontSize: 12, fontWeight: "700", textTransform: "uppercase", paddingTop: 12 }}>Custom fields</Text>
      {columns.map((c, i) => {
        const value = item.customColumnValues?.[c.id] ?? null;
        const isEditing = editingId === c.id;
        return (
          <View key={c.id} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 12, borderBottomWidth: i < columns.length - 1 ? 1 : 0, borderBottomColor: colors.border }}>
            <Text style={{ color: colors.textMuted, fontSize: 13 }}>{c.name}</Text>
            {isEditing ? (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <TextInput
                  style={{ borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, paddingHorizontal: 10, paddingVertical: 6, color: colors.text, fontSize: 13, minWidth: 100, textAlign: "right" }}
                  value={draft}
                  onChangeText={setDraft}
                  keyboardType={c.fieldType === "NUMBER" ? "numeric" : "default"}
                  autoFocus
                  onBlur={() => { setValueMutation.mutate({ columnId: c.id, entityId: item.id, value: draft || null }); setEditingId(null); }}
                />
              </View>
            ) : (
              <TouchableOpacity disabled={!canEdit} onPress={() => { setDraft(value ?? ""); setEditingId(c.id); }}>
                <Text style={{ color: colors.text, fontSize: 13, fontWeight: "600" }}>{value ?? (canEdit ? "Tap to set" : "—")}</Text>
              </TouchableOpacity>
            )}
          </View>
        );
      })}
    </View>
  );
}
