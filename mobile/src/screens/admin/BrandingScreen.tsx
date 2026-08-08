import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ActivityIndicator, Image, ScrollView, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { axiosClient } from "../../api/axiosClient";
import { API_ORIGIN } from "../../config/env";
import { useTheme } from "../../theme/ThemeContext";
import { useAuth } from "../../auth/AuthContext";
import { useToast } from "../../components/toast/ToastProvider";
import { KeyboardAvoidingScreen } from "../../components/KeyboardAvoidingScreen";
import { PickerModal, PickerOption } from "../../components/PickerModal";
import { ShimmerList } from "../../components/Shimmer";

interface BrandingFields {
  companyName?: string;
  brandPrimaryColor?: string;
  brandSecondaryColor?: string;
  appIconUrl?: string | null;
  faviconUrl?: string | null;
  docsWatermarkUrl?: string | null;
  docsWatermarkPosition?: string;
}

const WATERMARK_POSITIONS: PickerOption[] = [
  { id: "top-left", label: "Top Left" },
  { id: "top-center", label: "Top Center" },
  { id: "top-right", label: "Top Right" },
  { id: "middle-left", label: "Middle Left" },
  { id: "center", label: "Center" },
  { id: "middle-right", label: "Middle Right" },
  { id: "bottom-left", label: "Bottom Left" },
  { id: "bottom-center", label: "Bottom Center" },
  { id: "bottom-right", label: "Bottom Right" },
];

const HEX_COLOR_PATTERN = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

function BrandingUploader({ type, label, hint, currentUrl, canEdit, onRemove }: { type: "appIcon" | "favicon" | "docsWatermark"; label: string; hint?: string; currentUrl: string | null; canEdit: boolean; onRemove?: () => void }) {
  const { colors, spacing, radius } = useTheme();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [uploading, setUploading] = useState(false);

  async function pickAndUpload() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      showToast({ variant: "error", title: "Permission needed", message: "Photo library access is required to pick an image." });
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 1 });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    const fd = new FormData();
    fd.append("type", type);
    fd.append("file", { uri: asset.uri, name: asset.fileName ?? "branding.png", type: asset.mimeType ?? "image/png" } as unknown as Blob);
    setUploading(true);
    try {
      await axiosClient.post("/settings/branding", fd, { headers: { "Content-Type": "multipart/form-data" } });
      queryClient.invalidateQueries({ queryKey: ["mobile-branding-fields"] });
      showToast({ variant: "success", title: `${label} updated` });
    } catch (err: any) {
      showToast({ variant: "error", title: "Upload failed", message: err?.response?.data?.error ?? "Could not upload the file." });
    } finally {
      setUploading(false);
    }
  }

  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
      <View style={{ width: 44, height: 44, borderRadius: radius.sm, backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
        {currentUrl ? <Image source={{ uri: `${API_ORIGIN}${currentUrl}` }} style={{ width: "100%", height: "100%" }} resizeMode="contain" /> : <Ionicons name="image-outline" size={18} color={colors.textMuted} />}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ color: colors.text, fontSize: 12.5, fontWeight: "700" }}>{label}</Text>
        <Text style={{ color: colors.textMuted, fontSize: 10.5 }}>{hint ?? "PNG, JPEG, or SVG, up to 2MB"}</Text>
      </View>
      {canEdit && (
        <View style={{ flexDirection: "row", gap: 6 }}>
          <TouchableOpacity style={{ borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 10, paddingVertical: 6 }} disabled={uploading} onPress={pickAndUpload}>
            {uploading ? <ActivityIndicator size="small" color={colors.text} /> : <Text style={{ color: colors.text, fontSize: 11, fontWeight: "700" }}>Upload</Text>}
          </TouchableOpacity>
          {currentUrl && onRemove && (
            <TouchableOpacity style={{ borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 10, paddingVertical: 6 }} onPress={onRemove}>
              <Text style={{ color: colors.text, fontSize: 11, fontWeight: "700" }}>Remove</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );
}

// Mirrors client/src/pages/appSettings/BrandingTab.tsx — App Identity, Colors, and Docs Watermark
// sections. The Login Page Designer section (LoginPageDesigner.tsx) is a drag-and-drop canvas
// editor for background/layout/overlay blocks — same simplification already applied to the Form
// Template field builder and Site Map editor: no mobile precedent for canvas drag-positioning, so
// it stays web-only. Everything else here has full read/write parity.
export function BrandingScreen() {
  const { colors, spacing, radius } = useTheme();
  const { hasPermission } = useAuth();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const canEdit = hasPermission("branding", "edit");

  const { data: fields, isLoading } = useQuery({ queryKey: ["mobile-branding-fields"], queryFn: async () => (await axiosClient.get("/settings/branding-fields")).data as BrandingFields });
  const [values, setValues] = useState<BrandingFields>({});
  const [watermarkPickerOpen, setWatermarkPickerOpen] = useState(false);

  useEffect(() => { if (fields) setValues(fields); }, [fields]);

  const saveMutation = useMutation({
    mutationFn: () => axiosClient.put("/settings/branding-fields", { companyName: values.companyName, brandPrimaryColor: values.brandPrimaryColor, brandSecondaryColor: values.brandSecondaryColor }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["mobile-branding-fields"] }); showToast({ variant: "success", title: "Branding saved" }); },
    onError: (err: any) => showToast({ variant: "error", title: "Save failed", message: err?.response?.data?.error ?? "Could not save." }),
  });

  const watermarkPositionMutation = useMutation({
    mutationFn: (position: string) => axiosClient.put("/settings/branding-fields", { docsWatermarkPosition: position }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["mobile-branding-fields"] }); showToast({ variant: "success", title: "Watermark position saved" }); },
  });

  const removeWatermarkMutation = useMutation({
    mutationFn: () => axiosClient.delete("/settings/branding/docs-watermark"),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["mobile-branding-fields"] }),
  });

  const inputStyle = { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: colors.text, backgroundColor: colors.bg };
  const panel = { backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, marginBottom: spacing.md };

  if (isLoading) return <ShimmerList />;

  const primaryValid = HEX_COLOR_PATTERN.test(values.brandPrimaryColor ?? "");
  const secondaryValid = HEX_COLOR_PATTERN.test(values.brandSecondaryColor ?? "");

  return (
    <KeyboardAvoidingScreen>
      <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: spacing.lg }}>
        <View style={panel}>
          <Text style={{ color: colors.text, fontSize: 15, fontWeight: "700", marginBottom: spacing.sm }}>App Identity</Text>
          <Text style={{ color: colors.textMuted, fontSize: 11.5, fontWeight: "700", marginBottom: 4 }}>Company Name</Text>
          <TextInput style={[inputStyle, { marginBottom: spacing.md }]} value={values.companyName ?? ""} onChangeText={(v) => setValues((val) => ({ ...val, companyName: v }))} editable={canEdit} />
          <View style={{ gap: spacing.md }}>
            <BrandingUploader type="appIcon" label="App Icon (sidebar logo)" currentUrl={values.appIconUrl ?? null} canEdit={canEdit} />
            <BrandingUploader type="favicon" label="Browser Favicon" currentUrl={values.faviconUrl ?? null} canEdit={canEdit} />
          </View>
          {canEdit && (
            <TouchableOpacity style={{ backgroundColor: colors.primary, borderRadius: radius.md, alignItems: "center", paddingVertical: 12, marginTop: spacing.md, opacity: saveMutation.isPending ? 0.6 : 1 }} disabled={saveMutation.isPending} onPress={() => saveMutation.mutate()}>
              {saveMutation.isPending ? <ActivityIndicator color="#fff" /> : <Text style={{ color: "#fff", fontWeight: "700", fontSize: 13 }}>Save</Text>}
            </TouchableOpacity>
          )}
        </View>

        <View style={panel}>
          <Text style={{ color: colors.text, fontSize: 15, fontWeight: "700" }}>Colors</Text>
          <Text style={{ color: colors.textMuted, fontSize: 11.5, marginTop: 2, marginBottom: spacing.sm }}>Applied app-wide as the primary/secondary theme colors, including on the sign-in page.</Text>
          <View style={{ gap: spacing.md }}>
            <View>
              <Text style={{ color: colors.textMuted, fontSize: 11.5, fontWeight: "700", marginBottom: 4 }}>Primary Color</Text>
              <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
                <View style={{ width: 36, height: 36, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, backgroundColor: primaryValid ? values.brandPrimaryColor : colors.bg }} />
                <TextInput style={[inputStyle, { flex: 1, fontFamily: "monospace" }]} value={values.brandPrimaryColor ?? ""} onChangeText={(v) => setValues((val) => ({ ...val, brandPrimaryColor: v }))} placeholder="#7e14ff" placeholderTextColor={colors.textMuted} maxLength={7} autoCapitalize="none" editable={canEdit} />
              </View>
            </View>
            <View>
              <Text style={{ color: colors.textMuted, fontSize: 11.5, fontWeight: "700", marginBottom: 4 }}>Secondary Color</Text>
              <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
                <View style={{ width: 36, height: 36, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, backgroundColor: secondaryValid ? values.brandSecondaryColor : colors.bg }} />
                <TextInput style={[inputStyle, { flex: 1, fontFamily: "monospace" }]} value={values.brandSecondaryColor ?? ""} onChangeText={(v) => setValues((val) => ({ ...val, brandSecondaryColor: v }))} placeholder="#14b8a6" placeholderTextColor={colors.textMuted} maxLength={7} autoCapitalize="none" editable={canEdit} />
              </View>
            </View>
          </View>
          {canEdit && (
            <TouchableOpacity style={{ backgroundColor: colors.primary, borderRadius: radius.md, alignItems: "center", paddingVertical: 12, marginTop: spacing.md, opacity: saveMutation.isPending ? 0.6 : 1 }} disabled={saveMutation.isPending} onPress={() => saveMutation.mutate()}>
              {saveMutation.isPending ? <ActivityIndicator color="#fff" /> : <Text style={{ color: "#fff", fontWeight: "700", fontSize: 13 }}>Save</Text>}
            </TouchableOpacity>
          )}
        </View>

        <View style={panel}>
          <Text style={{ color: colors.text, fontSize: 15, fontWeight: "700" }}>Docs &amp; SOPs Watermark</Text>
          <Text style={{ color: colors.textMuted, fontSize: 11.5, marginTop: 2, marginBottom: spacing.sm }}>Shown behind every document in Docs &amp; SOPs, and embedded on every page of PDF/Word exports.</Text>
          <BrandingUploader type="docsWatermark" label="Watermark Image" hint="PNG or JPEG, up to 2MB" currentUrl={values.docsWatermarkUrl ?? null} canEdit={canEdit} onRemove={() => removeWatermarkMutation.mutate()} />
          <View style={{ marginTop: spacing.md }}>
            <Text style={{ color: colors.textMuted, fontSize: 11.5, fontWeight: "700", marginBottom: 4 }}>Position</Text>
            <TouchableOpacity style={[inputStyle, { flexDirection: "row", justifyContent: "space-between", alignItems: "center" }]} disabled={!canEdit} onPress={() => setWatermarkPickerOpen(true)}>
              <Text style={{ color: colors.text, fontSize: 13.5 }}>{WATERMARK_POSITIONS.find((p) => p.id === (values.docsWatermarkPosition ?? "center"))?.label}</Text>
              <Ionicons name="chevron-down" size={16} color={colors.textMuted} />
            </TouchableOpacity>
          </View>
        </View>

        <View style={{ backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, flexDirection: "row", gap: spacing.sm, alignItems: "flex-start" }}>
          <Ionicons name="desktop-outline" size={18} color={colors.textMuted} />
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.text, fontSize: 12.5, fontWeight: "700" }}>Login Page Designer</Text>
            <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 2 }}>The background/layout/overlay canvas editor is web-only — manage it from App Settings → Branding on the web app.</Text>
          </View>
        </View>

        <PickerModal
          visible={watermarkPickerOpen}
          title="Watermark Position"
          options={WATERMARK_POSITIONS}
          selectedId={values.docsWatermarkPosition ?? "center"}
          onSelect={(id) => { const position = String(id); setValues((v) => ({ ...v, docsWatermarkPosition: position })); watermarkPositionMutation.mutate(position); }}
          onClose={() => setWatermarkPickerOpen(false)}
        />
      </ScrollView>
    </KeyboardAvoidingScreen>
  );
}
