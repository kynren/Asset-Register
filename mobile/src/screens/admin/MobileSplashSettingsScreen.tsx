import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ActivityIndicator, Image, ScrollView, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { useVideoPlayer, VideoView } from "expo-video";
import { axiosClient } from "../../api/axiosClient";
import { API_ORIGIN } from "../../config/env";
import { useTheme } from "../../theme/ThemeContext";
import { useAuth } from "../../auth/AuthContext";
import { useToast } from "../../components/toast/ToastProvider";
import { KeyboardAvoidingScreen } from "../../components/KeyboardAvoidingScreen";

type MediaType = "PHOTO" | "GIF" | "VIDEO";

interface MobileSplashSettings {
  enabled: boolean;
  mediaType: MediaType;
  mediaUrl: string | null;
  backgroundColor: string;
  minDisplayMs: number;
}

const MEDIA_TYPES: { key: MediaType; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: "PHOTO", label: "Photo", icon: "image-outline" },
  { key: "GIF", label: "GIF", icon: "film-outline" },
  { key: "VIDEO", label: "Video", icon: "videocam-outline" },
];

// Deliberately gated by role name, not the generic hasPermission() RBAC system — mirrors
// requireSystemOrSuperAdmin in server/src/modules/settings/mobileSplash.routes.ts, which is
// narrower than any existing module permission (both "app-settings" and "branding" resolve
// differently than a strict System Admin + Super Admin only set).
export function MobileSplashSettingsScreen() {
  const { colors, spacing, radius } = useTheme();
  const { user } = useAuth();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const canManage = user?.roleName === "System Admin" || user?.roleName === "Super Admin";

  const { data, isLoading } = useQuery({
    queryKey: ["mobile-splash-settings"],
    queryFn: async () => (await axiosClient.get("/settings/mobile-splash")).data as MobileSplashSettings,
    enabled: canManage,
  });

  const [form, setForm] = useState<MobileSplashSettings | null>(null);
  useEffect(() => {
    if (data) setForm(data);
  }, [data]);

  const [uploading, setUploading] = useState(false);

  const saveMutation = useMutation({
    mutationFn: (values: MobileSplashSettings) => axiosClient.put("/settings/mobile-splash", values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mobile-splash-settings"] });
      showToast({ variant: "success", title: "Loading screen settings saved" });
    },
    onError: (err: any) => showToast({ variant: "error", title: "Save failed", message: err?.response?.data?.error ?? "Could not save settings." }),
  });

  const player = useVideoPlayer(form?.mediaType === "VIDEO" && form.mediaUrl ? `${API_ORIGIN}${form.mediaUrl}` : null, (p) => {
    p.loop = true;
    p.muted = true;
    p.play();
  });

  async function pickAndUpload(mediaType: MediaType) {
    if (!form) return;
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      showToast({ variant: "error", title: "Permission needed", message: "Photo library access is required to pick a file." });
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: mediaType === "VIDEO" ? ["videos"] : ["images"],
      quality: 1,
    });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    const defaultName = mediaType === "VIDEO" ? "splash.mp4" : mediaType === "GIF" ? "splash.gif" : "splash.jpg";
    const defaultType = mediaType === "VIDEO" ? "video/mp4" : mediaType === "GIF" ? "image/gif" : "image/jpeg";
    const fd = new FormData();
    fd.append("file", { uri: asset.uri, name: asset.fileName ?? defaultName, type: asset.mimeType ?? defaultType } as unknown as Blob);

    const endpoint = mediaType === "VIDEO" ? "upload-video" : mediaType === "GIF" ? "upload-gif" : "upload-photo";
    setUploading(true);
    try {
      const res = await axiosClient.post(`/settings/mobile-splash/${endpoint}`, fd, { headers: { "Content-Type": "multipart/form-data" } });
      setForm((f) => (f ? { ...f, mediaType, mediaUrl: res.data.url } : f));
    } catch (err: any) {
      showToast({ variant: "error", title: "Upload failed", message: err?.response?.data?.error ?? "Could not upload the file." });
    } finally {
      setUploading(false);
    }
  }

  if (!canManage) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg, padding: spacing.xl }}>
        <Ionicons name="lock-closed-outline" size={28} color={colors.textMuted} />
        <Text style={{ color: colors.textMuted, fontSize: 13, marginTop: spacing.sm, textAlign: "center" }}>
          Only a System Admin or Super Admin can manage the app loading screen.
        </Text>
      </View>
    );
  }

  if (isLoading || !form) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg }}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  const sectionTitle = { color: colors.text, fontSize: 14, fontWeight: "700" as const, marginBottom: spacing.md };
  const panel = { backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, marginBottom: spacing.md };
  const previewUrl = form.mediaUrl ? `${API_ORIGIN}${form.mediaUrl}` : null;

  return (
    <KeyboardAvoidingScreen>
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: spacing.lg }}>
      <View style={panel}>
        <TouchableOpacity style={{ flexDirection: "row", alignItems: "center", gap: 8 }} onPress={() => setForm({ ...form, enabled: !form.enabled })}>
          <Ionicons name={form.enabled ? "checkbox" : "square-outline"} size={20} color={form.enabled ? colors.primary : colors.textMuted} />
          <Text style={{ color: colors.text, fontSize: 13, fontWeight: "600", flex: 1 }}>Show a custom loading screen</Text>
        </TouchableOpacity>
        <Text style={{ color: colors.textMuted, fontSize: 11.5, marginTop: spacing.sm }}>
          Apple and Google both require the native launch screen to stay a static image — this custom screen renders immediately after it, so
          it's the only place a photo, GIF, or video can appear during app startup.
        </Text>
      </View>

      <View style={panel}>
        <Text style={sectionTitle}>Media Type</Text>
        <View style={{ flexDirection: "row", gap: spacing.sm, marginBottom: spacing.md }}>
          {MEDIA_TYPES.map((t) => (
            <TouchableOpacity
              key={t.key}
              style={{
                flex: 1,
                alignItems: "center",
                gap: 4,
                paddingVertical: 10,
                borderRadius: radius.md,
                borderWidth: 1,
                borderColor: form.mediaType === t.key ? colors.primary : colors.border,
                backgroundColor: form.mediaType === t.key ? colors.primarySoft : "transparent",
              }}
              onPress={() => setForm({ ...form, mediaType: t.key })}
            >
              <Ionicons name={t.icon} size={18} color={form.mediaType === t.key ? colors.primary : colors.textMuted} />
              <Text style={{ fontSize: 11.5, fontWeight: "700", color: form.mediaType === t.key ? colors.primary : colors.textMuted }}>{t.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {previewUrl && (
          <View style={{ borderRadius: radius.md, overflow: "hidden", backgroundColor: form.backgroundColor, aspectRatio: 9 / 16, maxHeight: 260, marginBottom: spacing.md }}>
            {form.mediaType === "VIDEO" ? (
              <VideoView player={player} style={{ width: "100%", height: "100%" }} contentFit="cover" nativeControls={false} />
            ) : (
              <Image source={{ uri: previewUrl }} style={{ width: "100%", height: "100%" }} resizeMode="cover" />
            )}
          </View>
        )}

        <TouchableOpacity
          style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingVertical: 11 }}
          disabled={uploading}
          onPress={() => pickAndUpload(form.mediaType)}
        >
          {uploading ? <ActivityIndicator size="small" color={colors.text} /> : <Ionicons name="cloud-upload-outline" size={16} color={colors.text} />}
          <Text style={{ color: colors.text, fontWeight: "700", fontSize: 12.5 }}>{previewUrl ? "Replace File" : "Choose File"}</Text>
        </TouchableOpacity>
        {form.mediaType === "PHOTO" && <Text style={{ color: colors.textMuted, fontSize: 10.5, marginTop: 6 }}>PNG, JPEG, or WebP · up to 8MB</Text>}
        {form.mediaType === "GIF" && <Text style={{ color: colors.textMuted, fontSize: 10.5, marginTop: 6 }}>Animated GIF · up to 12MB</Text>}
        {form.mediaType === "VIDEO" && <Text style={{ color: colors.textMuted, fontSize: 10.5, marginTop: 6 }}>MP4 (H.264) · up to 30MB · keep it short, this plays on every launch</Text>}
      </View>

      <View style={panel}>
        <Text style={sectionTitle}>Background Color</Text>
        <TextInput
          style={{ borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: colors.text, backgroundColor: colors.surface }}
          value={form.backgroundColor}
          onChangeText={(v) => setForm({ ...form, backgroundColor: v })}
          placeholder="#0d1117"
          placeholderTextColor={colors.textMuted}
          autoCapitalize="none"
        />
      </View>

      <View style={panel}>
        <Text style={sectionTitle}>Minimum Display Time</Text>
        <TextInput
          style={{ borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: colors.text, backgroundColor: colors.surface }}
          value={String(form.minDisplayMs)}
          onChangeText={(v) => setForm({ ...form, minDisplayMs: Math.max(0, Math.min(10000, Number(v.replace(/[^0-9]/g, "")) || 0)) })}
          keyboardType="numeric"
        />
        <Text style={{ color: colors.textMuted, fontSize: 10.5, marginTop: 6 }}>Milliseconds — how long the loading screen stays up even if the app is ready sooner (max 10,000).</Text>
      </View>

      <TouchableOpacity
        style={{ backgroundColor: colors.primary, borderRadius: radius.md, alignItems: "center", paddingVertical: 12, opacity: saveMutation.isPending ? 0.6 : 1 }}
        disabled={saveMutation.isPending}
        onPress={() => saveMutation.mutate(form)}
      >
        {saveMutation.isPending ? <ActivityIndicator color="#fff" /> : <Text style={{ color: "#fff", fontWeight: "700", fontSize: 13 }}>Save</Text>}
      </TouchableOpacity>
    </ScrollView>
    </KeyboardAvoidingScreen>
  );
}
