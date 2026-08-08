import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import dayjs from "dayjs";
import { FlatList, Modal, RefreshControl, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { WebView } from "react-native-webview";
import { axiosClient } from "../../api/axiosClient";
import { useTheme } from "../../theme/ThemeContext";

interface NotificationItem {
  id: number;
  type: string;
  message: string;
  isRead: boolean;
  linkUrl: string | null;
  createdAt: string;
}

interface EmailLogItem {
  id: number;
  to: string;
  subject: string;
  text: string;
  html: string | null;
  eventType: string | null;
  delivered: boolean;
  createdAt: string;
}

const TABS = [
  { key: "notifications", label: "Notifications" },
  { key: "emails", label: "Emails" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

// Mirrors client/src/pages/notifications/NotificationsPage.tsx's EmailPreviewModal — javaScriptEnabled
// is off so a stored email's HTML renders fully inert, the same intent as the web version's
// sandbox="" iframe (no scripts, no same-origin access).
function EmailPreviewModal({ email, onClose }: { email: EmailLogItem; onClose: () => void }) {
  const { colors, spacing } = useTheme();
  const html = email.html ?? `<pre style="white-space:pre-wrap;font-family:inherit;">${email.text}</pre>`;

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border }}>
          <Text style={{ color: colors.text, fontSize: 15, fontWeight: "700", flex: 1 }} numberOfLines={1}>{email.subject}</Text>
          <TouchableOpacity onPress={onClose}>
            <Ionicons name="close" size={24} color={colors.textMuted} />
          </TouchableOpacity>
        </View>
        <View style={{ padding: spacing.md, flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          <Text style={{ color: colors.textMuted, fontSize: 11.5 }}>To: {email.to}</Text>
          <Text style={{ color: colors.textMuted, fontSize: 11.5 }}>{dayjs(email.createdAt).format("DD MMM YYYY, HH:mm")}</Text>
          {email.eventType && (
            <View style={{ backgroundColor: colors.border, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 }}>
              <Text style={{ color: colors.textMuted, fontSize: 10, fontWeight: "700" }}>{email.eventType}</Text>
            </View>
          )}
          <View style={{ backgroundColor: email.delivered ? colors.success + "22" : colors.border, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 }}>
            <Text style={{ color: email.delivered ? colors.success : colors.textMuted, fontSize: 10, fontWeight: "700" }}>
              {email.delivered ? "Delivered" : "Not sent (SMTP not configured)"}
            </Text>
          </View>
        </View>
        <WebView source={{ html }} style={{ flex: 1 }} originWhitelist={["*"]} javaScriptEnabled={false} />
      </View>
    </Modal>
  );
}

export function NotificationsScreen() {
  const { colors, spacing, radius } = useTheme();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<TabKey>("notifications");
  const [selectedEmail, setSelectedEmail] = useState<EmailLogItem | null>(null);

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ["mobile-notifications"],
    queryFn: async () => (await axiosClient.get("/notifications/all")).data.notifications as NotificationItem[],
    enabled: tab === "notifications",
  });

  const { data: emails, isLoading: emailsLoading, refetch: refetchEmails, isRefetching: emailsRefetching } = useQuery({
    queryKey: ["mobile-notification-emails"],
    queryFn: async () => (await axiosClient.get("/notifications/emails")).data.emails as EmailLogItem[],
    enabled: tab === "emails",
  });

  async function markRead(id: number) {
    await axiosClient.post(`/notifications/${id}/read`);
    queryClient.invalidateQueries({ queryKey: ["mobile-notifications"] });
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ flexDirection: "row", gap: spacing.sm, padding: spacing.lg, paddingBottom: 0 }}>
        {TABS.map((t) => (
          <TouchableOpacity
            key={t.key}
            onPress={() => setTab(t.key)}
            style={{
              paddingHorizontal: 14,
              paddingVertical: 7,
              borderRadius: radius.md,
              backgroundColor: tab === t.key ? colors.primary : colors.surface,
              borderWidth: 1,
              borderColor: tab === t.key ? colors.primary : colors.border,
            }}
          >
            <Text style={{ color: tab === t.key ? "#fff" : colors.text, fontSize: 12.5, fontWeight: "700" }}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {tab === "notifications" && (
        <FlatList
          data={data ?? []}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm }}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.primary} />}
          ListEmptyComponent={
            !isLoading ? <Text style={{ color: colors.textMuted, textAlign: "center", marginTop: 40 }}>No notifications yet.</Text> : null
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              onPress={() => !item.isRead && markRead(item.id)}
              style={{
                backgroundColor: colors.surface,
                borderRadius: radius.md,
                padding: spacing.md,
                borderWidth: 1,
                borderColor: item.isRead ? colors.border : colors.primary,
              }}
            >
              <Text style={{ color: colors.text, fontSize: 14, fontWeight: item.isRead ? "400" : "700" }}>{item.message}</Text>
              <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 4 }}>{dayjs(item.createdAt).format("DD MMM YYYY HH:mm")}</Text>
            </TouchableOpacity>
          )}
        />
      )}

      {tab === "emails" && (
        <FlatList
          data={emails ?? []}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm }}
          refreshControl={<RefreshControl refreshing={emailsRefetching} onRefresh={refetchEmails} tintColor={colors.primary} />}
          ListEmptyComponent={
            !emailsLoading ? <Text style={{ color: colors.textMuted, textAlign: "center", marginTop: 40 }}>No emails sent to you yet.</Text> : null
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              onPress={() => setSelectedEmail(item)}
              style={{ backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md, borderWidth: 1, borderColor: colors.border }}
            >
              <Text style={{ color: colors.text, fontSize: 14, fontWeight: "600" }} numberOfLines={1}>{item.subject}</Text>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 6 }}>
                <Text style={{ color: colors.textMuted, fontSize: 11 }}>{dayjs(item.createdAt).format("DD MMM YYYY HH:mm")}</Text>
                {item.eventType && <Text style={{ color: colors.textMuted, fontSize: 11 }}>· {item.eventType}</Text>}
                <View style={{ backgroundColor: item.delivered ? colors.success + "22" : colors.border, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 1 }}>
                  <Text style={{ color: item.delivered ? colors.success : colors.textMuted, fontSize: 9.5, fontWeight: "700" }}>
                    {item.delivered ? "Delivered" : "Not sent"}
                  </Text>
                </View>
              </View>
            </TouchableOpacity>
          )}
        />
      )}

      {selectedEmail && <EmailPreviewModal email={selectedEmail} onClose={() => setSelectedEmail(null)} />}
    </View>
  );
}
