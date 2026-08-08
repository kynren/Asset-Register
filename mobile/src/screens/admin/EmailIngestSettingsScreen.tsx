import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ActivityIndicator, ScrollView, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import dayjs from "dayjs";
import { axiosClient } from "../../api/axiosClient";
import { useTheme } from "../../theme/ThemeContext";
import { useAuth } from "../../auth/AuthContext";
import { PickerModal, PickerOption } from "../../components/PickerModal";
import { ShimmerDetail } from "../../components/Shimmer";

interface EmailIngestSettings {
  id: number;
  isEnabled: boolean;
  imapHost: string | null;
  imapPort: number | null;
  imapUser: string | null;
  mailbox: string;
  fallbackRequesterId: number | null;
  defaultCategoryId: number | null;
  lastPolledAt: string | null;
  lastError: string | null;
}

// Mirrors client/src/pages/admin/EmailIngestSettingsTab.tsx — turns inbound emails to a support
// mailbox into Helpdesk tickets automatically via IMAP polling.
export function EmailIngestSettingsScreen() {
  const { colors, spacing, radius } = useTheme();
  const { hasPermission } = useAuth();
  const canEdit = hasPermission("admin", "edit");
  const queryClient = useQueryClient();
  const [values, setValues] = useState<Partial<EmailIngestSettings> & { imapPassword?: string }>({});
  const [requesterPickerOpen, setRequesterPickerOpen] = useState(false);
  const [categoryPickerOpen, setCategoryPickerOpen] = useState(false);

  const { data: settings, isLoading } = useQuery({
    queryKey: ["mobile-email-ingest-settings"],
    queryFn: async () => (await axiosClient.get("/email-ingest-settings")).data as EmailIngestSettings,
  });
  const { data: users } = useQuery({ queryKey: ["mobile-users-directory"], queryFn: async () => (await axiosClient.get("/users/directory")).data as { id: number; firstName: string; lastName: string }[] });
  const { data: categories } = useQuery({ queryKey: ["mobile-ticket-categories"], queryFn: async () => (await axiosClient.get("/ticket-categories")).data as { id: number; name: string }[] });

  useEffect(() => {
    if (settings) setValues((v) => ({ ...settings, imapPassword: v.imapPassword }));
  }, [settings]);

  const saveMutation = useMutation({
    mutationFn: () =>
      axiosClient.put("/email-ingest-settings", {
        isEnabled: values.isEnabled ?? false,
        imapHost: values.imapHost || null,
        imapPort: values.imapPort ?? 993,
        imapUser: values.imapUser || null,
        imapPassword: values.imapPassword || undefined,
        mailbox: values.mailbox || "INBOX",
        fallbackRequesterId: values.fallbackRequesterId ?? null,
        defaultCategoryId: values.defaultCategoryId ?? null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mobile-email-ingest-settings"] });
      setValues((v) => ({ ...v, imapPassword: "" }));
    },
  });

  function update<K extends keyof typeof values>(key: K, value: (typeof values)[K]) {
    setValues((v) => ({ ...v, [key]: value }));
  }

  const inputStyle = { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: colors.text, backgroundColor: colors.surface };
  const pickerStyle = { ...inputStyle, flexDirection: "row" as const, justifyContent: "space-between" as const, alignItems: "center" as const };

  const requesterOptions: PickerOption[] = [{ id: "", label: "None — skip unrecognized senders" }, ...(users ?? []).map((u) => ({ id: String(u.id), label: `${u.firstName} ${u.lastName}` }))];
  const categoryOptions: PickerOption[] = [{ id: "", label: "—" }, ...(categories ?? []).map((c) => ({ id: String(c.id), label: c.name }))];
  const selectedRequester = requesterOptions.find((o) => o.id === String(values.fallbackRequesterId ?? ""));
  const selectedCategory = categoryOptions.find((o) => o.id === String(values.defaultCategoryId ?? ""));

  if (isLoading || !settings) return <ShimmerDetail />;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}>
      <Text style={{ color: colors.textMuted, fontSize: 12 }}>
        Turn inbound emails to a dedicated support mailbox into Helpdesk tickets automatically. This organization's server
        polls the mailbox every couple of minutes — no code or webhook setup needed on your side.
      </Text>

      <TouchableOpacity disabled={!canEdit} style={{ flexDirection: "row", alignItems: "center", gap: 8 }} onPress={() => update("isEnabled", !values.isEnabled)}>
        <Ionicons name={values.isEnabled ? "checkbox" : "square-outline"} size={20} color={values.isEnabled ? colors.primary : colors.textMuted} />
        <Text style={{ color: colors.text, fontSize: 13, fontWeight: "600" }}>Enabled</Text>
      </TouchableOpacity>

      <View style={{ gap: 10 }}>
        <TextInput style={inputStyle} value={values.imapHost ?? ""} onChangeText={(v) => update("imapHost", v)} placeholder="IMAP Host (imap.example.com)" placeholderTextColor={colors.textMuted} editable={canEdit} autoCapitalize="none" />
        <TextInput style={inputStyle} value={String(values.imapPort ?? 993)} onChangeText={(v) => update("imapPort", Number(v) || 993)} placeholder="IMAP Port" placeholderTextColor={colors.textMuted} keyboardType="number-pad" editable={canEdit} />
        <TextInput style={inputStyle} value={values.imapUser ?? ""} onChangeText={(v) => update("imapUser", v)} placeholder="IMAP User (support@example.com)" placeholderTextColor={colors.textMuted} editable={canEdit} autoCapitalize="none" />
        <TextInput style={inputStyle} value={values.imapPassword ?? ""} onChangeText={(v) => update("imapPassword", v)} placeholder="IMAP Password (leave blank to keep current)" placeholderTextColor={colors.textMuted} secureTextEntry editable={canEdit} />
        <TextInput style={inputStyle} value={values.mailbox ?? "INBOX"} onChangeText={(v) => update("mailbox", v)} placeholder="Mailbox" placeholderTextColor={colors.textMuted} editable={canEdit} />

        <Text style={{ color: colors.textMuted, fontSize: 10.5, fontWeight: "700", textTransform: "uppercase" }}>Fallback Requester (unrecognized senders)</Text>
        <TouchableOpacity style={pickerStyle} disabled={!canEdit} onPress={() => setRequesterPickerOpen(true)}>
          <Text style={{ color: colors.text }}>{selectedRequester?.label ?? "None — skip unrecognized senders"}</Text>
          <Ionicons name="chevron-down" size={16} color={colors.textMuted} />
        </TouchableOpacity>

        <Text style={{ color: colors.textMuted, fontSize: 10.5, fontWeight: "700", textTransform: "uppercase" }}>Default Category</Text>
        <TouchableOpacity style={pickerStyle} disabled={!canEdit} onPress={() => setCategoryPickerOpen(true)}>
          <Text style={{ color: colors.text }}>{selectedCategory?.label ?? "—"}</Text>
          <Ionicons name="chevron-down" size={16} color={colors.textMuted} />
        </TouchableOpacity>
      </View>

      <View>
        <Text style={{ color: colors.textMuted, fontSize: 11.5 }}>
          Last polled: {settings.lastPolledAt ? dayjs(settings.lastPolledAt).format("DD MMM YYYY, HH:mm:ss") : "never"}
        </Text>
        {settings.lastError && (
          <View style={{ backgroundColor: colors.danger + "18", borderRadius: radius.md, padding: 10, marginTop: 6 }}>
            <Text style={{ color: colors.danger, fontSize: 11.5 }}>{settings.lastError}</Text>
          </View>
        )}
      </View>

      {canEdit && (
        <TouchableOpacity style={{ backgroundColor: colors.primary, borderRadius: radius.md, alignItems: "center", paddingVertical: 12 }} disabled={saveMutation.isPending} onPress={() => saveMutation.mutate()}>
          {saveMutation.isPending ? <ActivityIndicator color="#fff" /> : <Text style={{ color: "#fff", fontWeight: "700", fontSize: 13 }}>Save</Text>}
        </TouchableOpacity>
      )}

      <PickerModal visible={requesterPickerOpen} title="Fallback Requester" options={requesterOptions} selectedId={String(values.fallbackRequesterId ?? "")} onSelect={(v) => update("fallbackRequesterId", v ? Number(v) : null)} onClose={() => setRequesterPickerOpen(false)} />
      <PickerModal visible={categoryPickerOpen} title="Default Category" options={categoryOptions} selectedId={String(values.defaultCategoryId ?? "")} onSelect={(v) => update("defaultCategoryId", v ? Number(v) : null)} onClose={() => setCategoryPickerOpen(false)} />
    </ScrollView>
  );
}
