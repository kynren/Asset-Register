import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import { ActivityIndicator, ScrollView, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { axiosClient } from "../../api/axiosClient";
import { useTheme } from "../../theme/ThemeContext";
import { KeyboardAvoidingScreen } from "../../components/KeyboardAvoidingScreen";
import { MoreStackParamList } from "../../navigation/types";

interface BackupDestination {
  id: number;
  type: "EMAIL" | "S3";
  name: string;
  isEnabled: boolean;
  emailTo: string | null;
  s3Endpoint: string | null;
  s3Region: string | null;
  s3Bucket: string | null;
  s3AccessKeyId: string | null;
  s3PathPrefix: string | null;
  s3ForcePathStyle: boolean;
}

export function BackupDestinationFormScreen() {
  const { colors, spacing, radius } = useTheme();
  const navigation = useNavigation();
  const route = useRoute<RouteProp<MoreStackParamList, "BackupDestinationForm">>();
  const queryClient = useQueryClient();
  const destId = route.params?.id;

  const { data: existing } = useQuery({
    queryKey: ["mobile-backup-destinations"],
    queryFn: async () => (await axiosClient.get("/backups/destinations")).data as BackupDestination[],
    select: (data) => data.find((d) => d.id === destId),
    enabled: destId != null,
  });

  const [type, setType] = useState<"EMAIL" | "S3">(existing?.type ?? "EMAIL");
  const [name, setName] = useState(existing?.name ?? "");
  const [isEnabled, setIsEnabled] = useState(existing?.isEnabled ?? true);
  const [emailTo, setEmailTo] = useState(existing?.emailTo ?? "");
  const [s3Endpoint, setS3Endpoint] = useState(existing?.s3Endpoint ?? "");
  const [s3Region, setS3Region] = useState(existing?.s3Region ?? "");
  const [s3Bucket, setS3Bucket] = useState(existing?.s3Bucket ?? "");
  const [s3AccessKeyId, setS3AccessKeyId] = useState(existing?.s3AccessKeyId ?? "");
  const [s3SecretAccessKey, setS3SecretAccessKey] = useState("");
  const [s3PathPrefix, setS3PathPrefix] = useState(existing?.s3PathPrefix ?? "");
  const [s3ForcePathStyle, setS3ForcePathStyle] = useState(existing?.s3ForcePathStyle ?? false);
  const [error, setError] = useState<string | null>(null);

  const saveMutation = useMutation({
    mutationFn: () => {
      const body =
        type === "EMAIL"
          ? { type, name: name.trim(), isEnabled, emailTo: emailTo.trim() }
          : { type, name: name.trim(), isEnabled, s3Endpoint: s3Endpoint.trim() || undefined, s3Region: s3Region.trim() || undefined, s3Bucket: s3Bucket.trim(), s3AccessKeyId: s3AccessKeyId.trim(), s3SecretAccessKey: s3SecretAccessKey.trim() || undefined, s3PathPrefix: s3PathPrefix.trim() || undefined, s3ForcePathStyle };
      return destId ? axiosClient.patch(`/backups/destinations/${destId}`, body) : axiosClient.post("/backups/destinations", body);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mobile-backup-destinations"] });
      navigation.goBack();
    },
    onError: (err: any) => setError(err?.response?.data?.error ?? "Could not save this destination."),
  });

  const canSave = name.trim().length > 0 && (type === "EMAIL" ? emailTo.trim().length > 0 : s3Bucket.trim().length > 0 && s3AccessKeyId.trim().length > 0 && (!!destId || s3SecretAccessKey.trim().length > 0));
  const labelStyle = { color: colors.textMuted, fontSize: 12, fontWeight: "700" as const, marginBottom: 6, textTransform: "uppercase" as const, marginTop: spacing.md };
  const inputStyle = { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: colors.text, backgroundColor: colors.surface };

  return (
    <KeyboardAvoidingScreen>
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: spacing.lg, paddingBottom: 60 }}>
      {error && (
        <View style={{ backgroundColor: colors.danger + "22", borderRadius: radius.md, padding: 12, marginBottom: spacing.md }}>
          <Text style={{ color: colors.danger, fontSize: 13 }}>{error}</Text>
        </View>
      )}

      <Text style={[labelStyle, { marginTop: 0 }]}>Name</Text>
      <TextInput style={inputStyle} placeholder="e.g. Nightly email, Backblaze bucket" placeholderTextColor={colors.textMuted} value={name} onChangeText={setName} />

      <Text style={labelStyle}>Type</Text>
      <View style={{ flexDirection: "row", gap: 8 }}>
        {(["EMAIL", "S3"] as const).map((t) => (
          <TouchableOpacity key={t} disabled={!!destId} style={{ borderWidth: 1, borderColor: type === t ? colors.primary : colors.border, backgroundColor: type === t ? colors.primary + "22" : colors.surface, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 10, opacity: destId && type !== t ? 0.5 : 1 }} onPress={() => setType(t)}>
            <Text style={{ color: type === t ? colors.primary : colors.text, fontSize: 12.5, fontWeight: "700" }}>{t === "EMAIL" ? "Email" : "S3-compatible"}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <TouchableOpacity style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: spacing.md }} onPress={() => setIsEnabled((v) => !v)}>
        <Ionicons name={isEnabled ? "checkbox" : "square-outline"} size={20} color={isEnabled ? colors.primary : colors.textMuted} />
        <Text style={{ color: colors.text, fontSize: 12.5 }}>Enabled</Text>
      </TouchableOpacity>

      {type === "EMAIL" ? (
        <>
          <Text style={labelStyle}>Send To</Text>
          <TextInput style={inputStyle} placeholder="backups@example.com" placeholderTextColor={colors.textMuted} autoCapitalize="none" keyboardType="email-address" value={emailTo} onChangeText={setEmailTo} />
        </>
      ) : (
        <>
          <Text style={labelStyle}>Bucket</Text>
          <TextInput style={inputStyle} placeholder="my-backups-bucket" placeholderTextColor={colors.textMuted} autoCapitalize="none" value={s3Bucket} onChangeText={setS3Bucket} />
          <Text style={labelStyle}>Region</Text>
          <TextInput style={inputStyle} placeholder="us-east-1" placeholderTextColor={colors.textMuted} autoCapitalize="none" value={s3Region} onChangeText={setS3Region} />
          <Text style={labelStyle}>Endpoint (leave blank for AWS S3)</Text>
          <TextInput style={inputStyle} placeholder="https://s3.eu-west-2.wasabisys.com" placeholderTextColor={colors.textMuted} autoCapitalize="none" value={s3Endpoint} onChangeText={setS3Endpoint} />
          <Text style={labelStyle}>Access Key ID</Text>
          <TextInput style={inputStyle} autoCapitalize="none" value={s3AccessKeyId} onChangeText={setS3AccessKeyId} />
          <Text style={labelStyle}>Secret Access Key{destId ? " (leave blank to keep current)" : ""}</Text>
          <TextInput style={inputStyle} placeholder={destId ? "••••••••" : ""} placeholderTextColor={colors.textMuted} autoCapitalize="none" secureTextEntry value={s3SecretAccessKey} onChangeText={setS3SecretAccessKey} />
          <Text style={labelStyle}>Path Prefix (optional)</Text>
          <TextInput style={inputStyle} placeholder="kynren/backups" placeholderTextColor={colors.textMuted} autoCapitalize="none" value={s3PathPrefix} onChangeText={setS3PathPrefix} />
          <TouchableOpacity style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: spacing.md }} onPress={() => setS3ForcePathStyle((v) => !v)}>
            <Ionicons name={s3ForcePathStyle ? "checkbox" : "square-outline"} size={20} color={s3ForcePathStyle ? colors.primary : colors.textMuted} />
            <Text style={{ color: colors.text, fontSize: 12, flex: 1 }}>Force path-style addressing (needed for most self-hosted MinIO setups)</Text>
          </TouchableOpacity>
        </>
      )}

      <TouchableOpacity
        style={{ backgroundColor: colors.primary, borderRadius: radius.md, alignItems: "center", paddingVertical: 15, marginTop: spacing.xl, opacity: canSave ? 1 : 0.6 }}
        disabled={!canSave || saveMutation.isPending}
        onPress={() => saveMutation.mutate()}
      >
        {saveMutation.isPending ? <ActivityIndicator color="#fff" /> : <Text style={{ color: "#fff", fontWeight: "700" }}>{destId ? "Save Changes" : "Add Destination"}</Text>}
      </TouchableOpacity>
    </ScrollView>
    </KeyboardAvoidingScreen>
  );
}
