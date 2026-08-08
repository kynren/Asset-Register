import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FlatList, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { axiosClient } from "../../api/axiosClient";
import { useTheme } from "../../theme/ThemeContext";
import { useAuth } from "../../auth/AuthContext";
import { useToast, type ToastVariant } from "../../components/toast/ToastProvider";
import { ShimmerList } from "../../components/Shimmer";
import { NOTIFICATION_TYPES, NotificationTypeInfo } from "../../lib/notificationTypes";

interface ToastSettingItem {
  id: number | null;
  type: string;
  isEnabled: boolean | null;
  variant: ToastVariant | null;
  title: string | null;
  message: string | null;
}

interface Draft {
  isEnabled: boolean;
  variant: ToastVariant;
  title: string;
  message: string;
}

const VARIANT_OPTIONS: ToastVariant[] = ["info", "success", "warning", "error"];

function draftFromSaved(info: NotificationTypeInfo, saved: ToastSettingItem | undefined): Draft {
  return {
    isEnabled: saved?.id != null ? saved.isEnabled ?? true : true,
    variant: (saved?.id != null ? saved.variant : null) ?? info.defaultVariant,
    title: (saved?.id != null ? saved.title : null) ?? "",
    message: (saved?.id != null ? saved.message : null) ?? "",
  };
}

// Mirrors client/src/pages/admin/ToastSettingsTab.tsx — customize the pop-up toast shown per
// notification type. Rendered as one expandable card per type instead of a wide table, since a
// phone has no room for 6 columns at once.
export function ToastSettingsScreen() {
  const { colors, spacing, radius } = useTheme();
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const { hasPermission } = useAuth();
  const canEdit = hasPermission("admin", "edit");
  const [expandedType, setExpandedType] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});

  const { data, isLoading } = useQuery({
    queryKey: ["mobile-toast-settings"],
    queryFn: async () => (await axiosClient.get("/toast-settings")).data as ToastSettingItem[],
  });

  useEffect(() => {
    if (!data) return;
    setDrafts((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const info of NOTIFICATION_TYPES) {
        if (next[info.type]) continue;
        next[info.type] = draftFromSaved(info, data.find((s) => s.type === info.type));
        changed = true;
      }
      return changed ? next : prev;
    });
  }, [data]);

  function updateDraft(type: string, patch: Partial<Draft>) {
    setDrafts((prev) => ({ ...prev, [type]: { ...prev[type], ...patch } }));
  }

  const saveMutation = useMutation({
    mutationFn: ({ type, draft }: { type: string; draft: Draft }) =>
      axiosClient.patch(`/toast-settings/${type}`, {
        isEnabled: draft.isEnabled,
        variant: draft.variant,
        title: draft.title || null,
        message: draft.message || null,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["mobile-toast-settings"] }),
  });

  function isDirty(info: NotificationTypeInfo, draft: Draft | undefined) {
    if (!draft) return false;
    const baseline = draftFromSaved(info, data?.find((s) => s.type === info.type));
    return draft.isEnabled !== baseline.isEnabled || draft.variant !== baseline.variant || draft.title !== baseline.title || draft.message !== baseline.message;
  }

  const inputStyle = { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 10, fontSize: 13, color: colors.text, backgroundColor: colors.bg };

  if (isLoading) return <ShimmerList />;

  return (
    <FlatList
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm }}
      data={NOTIFICATION_TYPES}
      keyExtractor={(item) => item.type}
      ListHeaderComponent={
        <Text style={{ color: colors.textMuted, fontSize: 12, marginBottom: spacing.md }}>
          Disabling a type stops it from popping a toast — it still appears in the notification bell either way.
        </Text>
      }
      renderItem={({ item: info }) => {
        const draft = drafts[info.type];
        if (!draft) return null;
        const expanded = expandedType === info.type;
        const dirty = isDirty(info, draft);
        return (
          <View style={{ backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, marginBottom: 6 }}>
            <TouchableOpacity style={{ flexDirection: "row", alignItems: "center" }} onPress={() => setExpandedType(expanded ? null : info.type)}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.text, fontSize: 13, fontWeight: "700" }}>{info.label}</Text>
                <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 2 }}>{info.description}</Text>
              </View>
              <TouchableOpacity disabled={!canEdit} onPress={() => updateDraft(info.type, { isEnabled: !draft.isEnabled })} style={{ marginRight: 8 }}>
                <Ionicons name={draft.isEnabled ? "checkbox" : "square-outline"} size={20} color={draft.isEnabled ? colors.primary : colors.textMuted} />
              </TouchableOpacity>
              <Ionicons name={expanded ? "chevron-up" : "chevron-down"} size={16} color={colors.textMuted} />
            </TouchableOpacity>

            {expanded && (
              <View style={{ marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.border, gap: 8 }}>
                <Text style={{ color: colors.textMuted, fontSize: 10.5, fontWeight: "700", textTransform: "uppercase" }}>Variant</Text>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                  {VARIANT_OPTIONS.map((v) => {
                    const active = draft.variant === v;
                    return (
                      <TouchableOpacity
                        key={v}
                        disabled={!canEdit}
                        onPress={() => updateDraft(info.type, { variant: v })}
                        style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: active ? colors.primary : colors.bg, borderWidth: 1, borderColor: active ? colors.primary : colors.border }}
                      >
                        <Text style={{ color: active ? "#fff" : colors.text, fontSize: 11.5, fontWeight: "600" }}>{v.charAt(0).toUpperCase() + v.slice(1)}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                <TextInput style={inputStyle} value={draft.title} onChangeText={(v) => updateDraft(info.type, { title: v })} placeholder={`Title override (${info.label})`} placeholderTextColor={colors.textMuted} editable={canEdit} />
                <TextInput style={inputStyle} value={draft.message} onChangeText={(v) => updateDraft(info.type, { message: v })} placeholder={`Message override (${info.description})`} placeholderTextColor={colors.textMuted} editable={canEdit} />
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <TouchableOpacity
                    style={{ flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, alignItems: "center", paddingVertical: 9 }}
                    onPress={() => showToast({ variant: draft.variant, title: draft.title || info.label, message: draft.message || info.description })}
                  >
                    <Text style={{ color: colors.text, fontSize: 12, fontWeight: "700" }}>Preview</Text>
                  </TouchableOpacity>
                  {canEdit && (
                    <TouchableOpacity
                      style={{ flex: 1, backgroundColor: colors.primary, borderRadius: radius.md, alignItems: "center", paddingVertical: 9, opacity: dirty ? 1 : 0.5 }}
                      disabled={!dirty || saveMutation.isPending}
                      onPress={() => saveMutation.mutate({ type: info.type, draft })}
                    >
                      <Text style={{ color: "#fff", fontSize: 12, fontWeight: "700" }}>{saveMutation.isPending ? "Saving..." : "Save"}</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            )}
          </View>
        );
      }}
    />
  );
}
