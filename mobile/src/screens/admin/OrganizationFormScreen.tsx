import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import { ActivityIndicator, Alert, Image, ScrollView, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import { axiosClient } from "../../api/axiosClient";
import { useTheme } from "../../theme/ThemeContext";
import { MoreStackParamList } from "../../navigation/types";

interface OrganizationRow {
  id: number;
  name: string;
  schemaName: string;
  createdAt: string;
  logoUrl: string | null;
}

// Mirrors client/src/pages/appSettings/OrganizationsTab.tsx's Create/EditOrganizationModal —
// create provisions a fresh schema + Super Admin, edit only touches name/schemaName/logo (per-org
// branding like app icon/favicon is edited by switching into that org and using System Settings).
export function OrganizationFormScreen() {
  const { colors, spacing, radius } = useTheme();
  const navigation = useNavigation();
  const route = useRoute<RouteProp<MoreStackParamList, "OrganizationForm">>();
  const queryClient = useQueryClient();
  const orgId = route.params?.id;

  const { data: existing } = useQuery({
    queryKey: ["mobile-app-settings-organizations"],
    queryFn: async () => (await axiosClient.get("/app-settings/organizations")).data as OrganizationRow[],
    select: (data) => data.find((o) => o.id === orgId),
    enabled: orgId != null,
  });
  const isDefaultOrg = existing?.schemaName === "public";

  const [name, setName] = useState(existing?.name ?? "");
  const [schemaName, setSchemaName] = useState(existing?.schemaName ?? "");
  const [logoUrl, setLogoUrl] = useState(existing?.logoUrl ?? null);
  const [organizationName, setOrganizationName] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const saveMutation = useMutation({
    mutationFn: (): Promise<{ data: any }> =>
      orgId
        ? axiosClient.patch(`/app-settings/organizations/${orgId}`, { name: name.trim(), schemaName: schemaName.trim() })
        : axiosClient.post("/app-settings/organizations", { organizationName: organizationName.trim(), firstName: firstName.trim(), lastName: lastName.trim(), email: email.trim(), password }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mobile-app-settings-organizations"] });
      navigation.goBack();
    },
    onError: (err: any) => setError(err?.response?.data?.error ?? "Could not save this organization."),
  });

  async function pickAndUploadLogo() {
    if (!orgId) return;
    const res = await DocumentPicker.getDocumentAsync({ type: "image/*", copyToCacheDirectory: true });
    if (res.canceled || !res.assets?.[0]) return;
    const file = res.assets[0];
    setUploadingLogo(true);
    try {
      const fd = new FormData();
      fd.append("file", { uri: file.uri, name: file.name, type: file.mimeType ?? "image/jpeg" } as any);
      const uploadRes = await axiosClient.post(`/app-settings/organizations/${orgId}/logo`, fd, { headers: { "Content-Type": "multipart/form-data" } });
      setLogoUrl(uploadRes.data.logoUrl);
      queryClient.invalidateQueries({ queryKey: ["mobile-app-settings-organizations"] });
    } catch {
      Alert.alert("Upload failed", "Could not upload this logo.");
    } finally {
      setUploadingLogo(false);
    }
  }

  const canSave = orgId
    ? name.trim().length > 0 && schemaName.trim().length > 0
    : organizationName.trim().length > 0 && firstName.trim().length > 0 && lastName.trim().length > 0 && email.trim().length > 0 && password.length >= 8;

  const labelStyle = { color: colors.textMuted, fontSize: 12, fontWeight: "700" as const, marginBottom: 6, textTransform: "uppercase" as const, marginTop: spacing.md };
  const inputStyle = { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: colors.text, backgroundColor: colors.surface };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: spacing.lg, paddingBottom: 60 }}>
      {error && (
        <View style={{ backgroundColor: colors.danger + "22", borderRadius: radius.md, padding: 12, marginBottom: spacing.md }}>
          <Text style={{ color: colors.danger, fontSize: 13 }}>{error}</Text>
        </View>
      )}

      {orgId ? (
        <>
          <Text style={[labelStyle, { marginTop: 0 }]}>Logo</Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
            <View style={{ width: 48, height: 48, borderRadius: 8, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
              {logoUrl ? <Image source={{ uri: logoUrl }} style={{ width: "100%", height: "100%" }} /> : <Ionicons name="briefcase-outline" size={18} color={colors.textMuted} />}
            </View>
            <TouchableOpacity style={{ borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 8 }} disabled={uploadingLogo} onPress={pickAndUploadLogo}>
              {uploadingLogo ? <ActivityIndicator size="small" color={colors.primary} /> : <Text style={{ color: colors.text, fontSize: 12, fontWeight: "700" }}>Upload Logo</Text>}
            </TouchableOpacity>
          </View>

          <Text style={labelStyle}>Organization Name</Text>
          <TextInput style={inputStyle} value={name} onChangeText={setName} />

          <Text style={labelStyle}>Schema Name {isDefaultOrg ? "(default org's schema cannot be renamed)" : ""}</Text>
          <TextInput style={[inputStyle, { fontFamily: "monospace" }]} autoCapitalize="none" editable={!isDefaultOrg} value={schemaName} onChangeText={(v) => setSchemaName(v.toLowerCase())} />
          {!isDefaultOrg && schemaName !== existing?.schemaName && (
            <Text style={{ color: colors.textMuted, fontSize: 11.5, marginTop: 6 }}>
              This physically renames the database schema. Any session currently viewing this organization will need to switch back into it again.
            </Text>
          )}
          <Text style={{ color: colors.textMuted, fontSize: 11.5, marginTop: spacing.md }}>
            Everything else per-organization (app icon, favicon, other branding) is edited by switching into this organization and opening System Settings there.
          </Text>
        </>
      ) : (
        <>
          <Text style={[labelStyle, { marginTop: 0 }]}>Organization Name</Text>
          <TextInput style={inputStyle} value={organizationName} onChangeText={setOrganizationName} />

          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            <View style={{ flex: 1 }}>
              <Text style={labelStyle}>Admin First Name</Text>
              <TextInput style={inputStyle} value={firstName} onChangeText={setFirstName} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={labelStyle}>Admin Last Name</Text>
              <TextInput style={inputStyle} value={lastName} onChangeText={setLastName} />
            </View>
          </View>

          <Text style={labelStyle}>Admin Email</Text>
          <TextInput style={inputStyle} autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} />

          <Text style={labelStyle}>Admin Password (min 8 characters)</Text>
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <TextInput style={[inputStyle, { flex: 1 }]} secureTextEntry={!showPassword} value={password} onChangeText={setPassword} />
            <TouchableOpacity style={{ position: "absolute", right: 12 }} onPress={() => setShowPassword((v) => !v)}>
              <Ionicons name={showPassword ? "eye-off-outline" : "eye-outline"} size={18} color={colors.textMuted} />
            </TouchableOpacity>
          </View>
          <Text style={{ color: colors.textMuted, fontSize: 11.5, marginTop: spacing.md }}>
            This user is created as that organization's Super Admin and can log in immediately.
          </Text>
        </>
      )}

      <TouchableOpacity
        style={{ backgroundColor: colors.primary, borderRadius: radius.md, alignItems: "center", paddingVertical: 15, marginTop: spacing.xl, opacity: canSave ? 1 : 0.6 }}
        disabled={!canSave || saveMutation.isPending}
        onPress={() => saveMutation.mutate()}
      >
        {saveMutation.isPending ? <ActivityIndicator color="#fff" /> : <Text style={{ color: "#fff", fontWeight: "700" }}>{orgId ? "Save Changes" : "Create Organization"}</Text>}
      </TouchableOpacity>
    </ScrollView>
  );
}
