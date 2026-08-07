import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ActivityIndicator, Alert, FlatList, Image, ScrollView, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import dayjs from "dayjs";
import { axiosClient } from "../../api/axiosClient";
import { useTheme } from "../../theme/ThemeContext";
import { useAuth } from "../../auth/AuthContext";
import { PickerModal, PickerOption } from "../../components/PickerModal";
import { useToast } from "../../components/toast/ToastProvider";
import { API_ORIGIN } from "../../config/env";

interface MediaAsset {
  id: number;
  originalName: string;
  url: string;
  mimeType: string;
  sizeBytes: number;
  type: "IMAGE" | "VIDEO" | "AUDIO" | "DOCUMENT" | "OTHER";
  title: string | null;
  altText: string | null;
  caption: string | null;
  description: string | null;
  width: number | null;
  height: number | null;
  createdAt: string;
}

const TYPE_ICON: Record<string, keyof typeof Ionicons.glyphMap> = { IMAGE: "image-outline", VIDEO: "videocam-outline", AUDIO: "musical-notes-outline", DOCUMENT: "document-text-outline", OTHER: "document-outline" };
const TYPE_OPTIONS: PickerOption[] = [
  { id: "", label: "All types" },
  { id: "IMAGE", label: "Image" },
  { id: "VIDEO", label: "Video" },
  { id: "AUDIO", label: "Audio" },
  { id: "DOCUMENT", label: "Document" },
  { id: "OTHER", label: "Other" },
];

function formatBytes(n: number | null): string {
  if (n === null) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function MediaLibraryScreen() {
  const { colors, spacing, radius } = useTheme();
  const { hasPermission } = useAuth();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [type, setType] = useState("");
  const [typePickerOpen, setTypePickerOpen] = useState(false);
  const [selected, setSelected] = useState<MediaAsset | null>(null);
  const [title, setTitle] = useState("");
  const [altText, setAltText] = useState("");
  const [caption, setCaption] = useState("");
  const [description, setDescription] = useState("");
  const [uploading, setUploading] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["mobile-media-library", page, search, type],
    queryFn: async () => (await axiosClient.get("/media-center/library", { params: { page, pageSize: 24, search: search || undefined, type: type || undefined } })).data as { rows: MediaAsset[]; total: number; page: number; totalPages: number },
  });

  const updateMutation = useMutation({
    mutationFn: () => axiosClient.patch(`/media-center/library/${selected!.id}`, { title, altText, caption, description }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mobile-media-library"] });
      setSelected(null);
    },
  });
  const deleteMutation = useMutation({
    mutationFn: () => axiosClient.delete(`/media-center/library/${selected!.id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mobile-media-library"] });
      setSelected(null);
    },
  });

  function openDetail(asset: MediaAsset) {
    setSelected(asset);
    setTitle(asset.title ?? "");
    setAltText(asset.altText ?? "");
    setCaption(asset.caption ?? "");
    setDescription(asset.description ?? "");
  }

  function confirmDelete() {
    if (!selected) return;
    Alert.alert("Delete media", `Delete "${selected.originalName}"? Any rich-text content already referencing this file will show a broken link.`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => deleteMutation.mutate() },
    ]);
  }

  async function pickAndUpload() {
    const res = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true });
    if (res.canceled || !res.assets?.[0]) return;
    const file = res.assets[0];
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", { uri: file.uri, name: file.name, type: file.mimeType ?? "application/octet-stream" } as any);
      await axiosClient.post("/media-center/library", fd, { headers: { "Content-Type": "multipart/form-data" } });
      queryClient.invalidateQueries({ queryKey: ["mobile-media-library"] });
    } catch {
      showToast({ variant: "error", title: "Upload failed", message: "Could not upload this file." });
    } finally {
      setUploading(false);
    }
  }

  const inputStyle = { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 10, fontSize: 13, color: colors.text, backgroundColor: colors.surface };

  if (selected) {
    const canEdit = hasPermission("app-settings", "edit");
    return (
      <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: spacing.lg }}>
        <TouchableOpacity onPress={() => setSelected(null)} style={{ flexDirection: "row", alignItems: "center", gap: 4, marginBottom: spacing.md }}>
          <Ionicons name="arrow-back" size={16} color={colors.primary} />
          <Text style={{ color: colors.primary, fontSize: 13, fontWeight: "700" }}>Back to Library</Text>
        </TouchableOpacity>

        {selected.type === "IMAGE" ? (
          <Image source={{ uri: `${API_ORIGIN}${selected.url}` }} style={{ width: "100%", height: 220, borderRadius: radius.md, backgroundColor: colors.surface }} resizeMode="contain" />
        ) : (
          <View style={{ width: "100%", height: 140, borderRadius: radius.md, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" }}>
            <Ionicons name={TYPE_ICON[selected.type]} size={40} color={colors.textMuted} />
          </View>
        )}
        <Text style={{ color: colors.textMuted, fontSize: 11.5, marginTop: spacing.sm }}>
          {selected.mimeType} · {formatBytes(selected.sizeBytes)}{selected.width ? ` · ${selected.width}×${selected.height}` : ""} · uploaded {dayjs(selected.createdAt).format("DD MMM YYYY HH:mm")}
        </Text>

        <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: "700", textTransform: "uppercase", marginTop: spacing.md, marginBottom: 4 }}>Title</Text>
        <TextInput style={inputStyle} editable={canEdit} value={title} onChangeText={setTitle} />
        <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: "700", textTransform: "uppercase", marginTop: spacing.sm, marginBottom: 4 }}>Alt Text</Text>
        <TextInput style={inputStyle} editable={canEdit} value={altText} onChangeText={setAltText} />
        <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: "700", textTransform: "uppercase", marginTop: spacing.sm, marginBottom: 4 }}>Caption</Text>
        <TextInput style={inputStyle} editable={canEdit} value={caption} onChangeText={setCaption} />
        <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: "700", textTransform: "uppercase", marginTop: spacing.sm, marginBottom: 4 }}>Description</Text>
        <TextInput style={[inputStyle, { minHeight: 70, textAlignVertical: "top" }]} multiline editable={canEdit} value={description} onChangeText={setDescription} />

        {canEdit && (
          <TouchableOpacity style={{ backgroundColor: colors.primary, borderRadius: radius.md, alignItems: "center", paddingVertical: 12, marginTop: spacing.md }} disabled={updateMutation.isPending} onPress={() => updateMutation.mutate()}>
            {updateMutation.isPending ? <ActivityIndicator color="#fff" /> : <Text style={{ color: "#fff", fontWeight: "700", fontSize: 13 }}>Save Details</Text>}
          </TouchableOpacity>
        )}
        {hasPermission("app-settings", "delete") && (
          <TouchableOpacity style={{ borderWidth: 1, borderColor: colors.danger, borderRadius: radius.md, alignItems: "center", paddingVertical: 12, marginTop: spacing.sm }} onPress={confirmDelete}>
            <Text style={{ color: colors.danger, fontWeight: "700", fontSize: 13 }}>Delete</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ padding: spacing.lg, paddingBottom: spacing.sm, gap: 8 }}>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <View style={{ flex: 1, flexDirection: "row", alignItems: "center", backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.md, borderWidth: 1, paddingHorizontal: 12, height: 42 }}>
            <Ionicons name="search" size={16} color={colors.textMuted} />
            <TextInput style={{ flex: 1, marginLeft: 8, color: colors.text }} placeholder="Search media..." placeholderTextColor={colors.textMuted} value={search} onChangeText={(v) => { setSearch(v); setPage(1); }} />
          </View>
          <TouchableOpacity style={{ borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 12, justifyContent: "center", backgroundColor: colors.surface }} onPress={() => setTypePickerOpen(true)}>
            <Text style={{ color: colors.text, fontSize: 12 }}>{TYPE_OPTIONS.find((t) => t.id === type)?.label}</Text>
          </TouchableOpacity>
        </View>
        {hasPermission("app-settings", "create") && (
          <TouchableOpacity style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: colors.primary, borderRadius: radius.md, paddingVertical: 10 }} disabled={uploading} onPress={pickAndUpload}>
            {uploading ? <ActivityIndicator color="#fff" size="small" /> : <Ionicons name="cloud-upload-outline" size={16} color="#fff" />}
            <Text style={{ color: "#fff", fontWeight: "700", fontSize: 13 }}>{uploading ? "Uploading..." : "Upload"}</Text>
          </TouchableOpacity>
        )}
      </View>

      {isLoading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />
      ) : (
        <FlatList
          key="grid-2"
          numColumns={2}
          data={data?.rows ?? []}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={{ padding: spacing.lg, paddingTop: 0, gap: spacing.sm }}
          columnWrapperStyle={{ gap: spacing.sm }}
          ListEmptyComponent={<Text style={{ color: colors.textMuted, textAlign: "center", marginTop: 24 }}>No media uploaded yet.</Text>}
          renderItem={({ item }) => (
            <TouchableOpacity style={{ flex: 1, backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.sm, marginBottom: spacing.sm }} onPress={() => openDetail(item)}>
              <View style={{ aspectRatio: 4 / 3, backgroundColor: colors.bg, borderRadius: radius.sm ?? 6, alignItems: "center", justifyContent: "center", overflow: "hidden", marginBottom: 6 }}>
                {item.type === "IMAGE" ? (
                  <Image source={{ uri: `${API_ORIGIN}${item.url}` }} style={{ width: "100%", height: "100%" }} resizeMode="cover" />
                ) : (
                  <Ionicons name={TYPE_ICON[item.type]} size={30} color={colors.textMuted} />
                )}
              </View>
              <Text style={{ color: colors.text, fontSize: 11.5, fontWeight: "600" }} numberOfLines={1}>{item.title || item.originalName}</Text>
              <Text style={{ color: colors.textMuted, fontSize: 10.5 }}>{formatBytes(item.sizeBytes)}</Text>
            </TouchableOpacity>
          )}
          ListFooterComponent={
            data && data.totalPages > 1 ? (
              <View style={{ flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 14, marginTop: 4 }}>
                <TouchableOpacity disabled={page <= 1} onPress={() => setPage((p) => p - 1)}><Ionicons name="chevron-back" size={18} color={page <= 1 ? colors.textMuted : colors.primary} /></TouchableOpacity>
                <Text style={{ color: colors.textMuted, fontSize: 12 }}>Page {page} of {data.totalPages}</Text>
                <TouchableOpacity disabled={page >= data.totalPages} onPress={() => setPage((p) => p + 1)}><Ionicons name="chevron-forward" size={18} color={page >= data.totalPages ? colors.textMuted : colors.primary} /></TouchableOpacity>
              </View>
            ) : null
          }
        />
      )}
      <PickerModal visible={typePickerOpen} title="Type" options={TYPE_OPTIONS} selectedId={type} onSelect={(v) => { setType((v as string) ?? ""); setPage(1); }} onClose={() => setTypePickerOpen(false)} />
    </View>
  );
}
