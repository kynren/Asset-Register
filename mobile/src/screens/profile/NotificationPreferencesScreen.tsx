import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ActivityIndicator, Linking, ScrollView, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Notifications from "expo-notifications";
import { axiosClient } from "../../api/axiosClient";
import { useTheme } from "../../theme/ThemeContext";
import { useToast } from "../../components/toast/ToastProvider";
import { registerForPushNotifications } from "../../lib/pushNotifications";

type NotificationEventKind = "TICKET_ASSIGNED" | "TICKET_WATCHING" | "ASSET_ASSIGNED" | "LOW_STOCK" | "MAINTENANCE_DUE" | "DEVICE_OFFLINE" | "PROJECT_UPDATED" | "STOCK_ISSUED";

interface PreferenceRow {
  kind: NotificationEventKind;
  inAppEnabled: boolean;
  emailEnabled: boolean;
}

// Mirrors client/src/pages/profile/NotificationsTab.tsx's EVENT_LABELS exactly, kind-for-kind.
const EVENT_LABELS: Record<NotificationEventKind, { label: string; description: string }> = {
  TICKET_ASSIGNED: { label: "Ticket Assigned to You", description: "A helpdesk ticket is assigned to you (individually or via a team)." },
  TICKET_WATCHING: { label: "Watched Ticket Updates", description: "Activity on a ticket you're watching." },
  ASSET_ASSIGNED: { label: "Asset Assigned to You", description: "An asset is checked out or assigned to you." },
  LOW_STOCK: { label: "Low Stock Alerts", description: "A stock item drops below its reorder threshold." },
  MAINTENANCE_DUE: { label: "Maintenance Due", description: "A scheduled maintenance task is coming due or overdue." },
  DEVICE_OFFLINE: { label: "Device Offline Alerts", description: "A monitored network device goes offline." },
  PROJECT_UPDATED: { label: "IT Project Updated", description: "Someone you've granted edit access to updates or moves an IT Project you created." },
  STOCK_ISSUED: { label: "Stock Issued to You", description: "A stock item is issued to you via scan-to-issue." },
};

type PushStatus = "checking" | "granted" | "denied" | "undetermined";

// There's no separate server-side "push" toggle — server/src/lib/notify.ts fires a push for every
// recipient whose inAppEnabled is true for that kind, mirroring the in-app feed 1:1. So the toggle
// below is labeled "Push & In-App" rather than exposing a channel that doesn't actually exist.
export function NotificationPreferencesScreen() {
  const { colors, spacing, radius } = useTheme();
  const { showToast } = useToast();

  const [pushStatus, setPushStatus] = useState<PushStatus>("checking");
  const [requesting, setRequesting] = useState(false);

  async function refreshPushStatus() {
    const { status } = await Notifications.getPermissionsAsync();
    setPushStatus(status as PushStatus);
  }

  useEffect(() => {
    refreshPushStatus();
  }, []);

  async function enablePush() {
    setRequesting(true);
    try {
      await registerForPushNotifications();
    } finally {
      setRequesting(false);
      await refreshPushStatus();
    }
  }

  const { data, isLoading } = useQuery({
    queryKey: ["mobile-notification-preferences"],
    queryFn: async () => (await axiosClient.get("/notification-preferences")).data as PreferenceRow[],
  });

  const [rows, setRows] = useState<PreferenceRow[] | null>(null);
  useEffect(() => {
    if (data) setRows(data);
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: () => axiosClient.put("/notification-preferences", { preferences: rows }),
    onSuccess: () => showToast({ variant: "success", title: "Notification preferences saved" }),
    onError: () => showToast({ variant: "error", title: "Save failed", message: "Could not save your preferences." }),
  });

  function toggle(kind: NotificationEventKind, field: "inAppEnabled" | "emailEnabled") {
    setRows((prev) => prev?.map((r) => (r.kind === kind ? { ...r, [field]: !r[field] } : r)) ?? prev);
  }

  const panel = { backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, marginBottom: spacing.md };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: spacing.lg }}>
      <View style={panel}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
          <Ionicons
            name={pushStatus === "granted" ? "notifications" : "notifications-off-outline"}
            size={20}
            color={pushStatus === "granted" ? colors.success : colors.textMuted}
          />
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.text, fontSize: 13, fontWeight: "700" }}>Push Notifications</Text>
            <Text style={{ color: colors.textMuted, fontSize: 11.5, marginTop: 2 }}>
              {pushStatus === "checking" && "Checking device permission..."}
              {pushStatus === "granted" && "Enabled on this device."}
              {pushStatus === "denied" && "Blocked in device settings — open Settings to turn it back on."}
              {pushStatus === "undetermined" && "Not enabled yet on this device."}
            </Text>
          </View>
          {pushStatus === "denied" && (
            <TouchableOpacity style={{ borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 10, paddingVertical: 6 }} onPress={() => Linking.openSettings()}>
              <Text style={{ color: colors.text, fontSize: 11.5, fontWeight: "700" }}>Settings</Text>
            </TouchableOpacity>
          )}
          {pushStatus === "undetermined" && (
            <TouchableOpacity style={{ backgroundColor: colors.primary, borderRadius: radius.md, paddingHorizontal: 10, paddingVertical: 6 }} disabled={requesting} onPress={enablePush}>
              {requesting ? <ActivityIndicator size="small" color="#fff" /> : <Text style={{ color: "#fff", fontSize: 11.5, fontWeight: "700" }}>Enable</Text>}
            </TouchableOpacity>
          )}
        </View>
      </View>

      <Text style={{ color: colors.textMuted, fontSize: 11.5, marginBottom: spacing.md }}>
        Choose which events notify you. Push mirrors In-App — turning an event off here stops both. Both channels are on by default.
      </Text>

      {isLoading || !rows ? (
        <ActivityIndicator color={colors.primary} />
      ) : (
        rows.map((row) => (
          <View key={row.kind} style={panel}>
            <Text style={{ color: colors.text, fontSize: 13, fontWeight: "600" }}>{EVENT_LABELS[row.kind].label}</Text>
            <Text style={{ color: colors.textMuted, fontSize: 11.5, marginTop: 2, marginBottom: spacing.sm }}>{EVENT_LABELS[row.kind].description}</Text>
            <View style={{ flexDirection: "row", gap: spacing.lg }}>
              <TouchableOpacity style={{ flexDirection: "row", alignItems: "center", gap: 6 }} onPress={() => toggle(row.kind, "inAppEnabled")}>
                <Ionicons name={row.inAppEnabled ? "checkbox" : "square-outline"} size={18} color={row.inAppEnabled ? colors.primary : colors.textMuted} />
                <Text style={{ color: colors.text, fontSize: 12 }}>Push & In-App</Text>
              </TouchableOpacity>
              <TouchableOpacity style={{ flexDirection: "row", alignItems: "center", gap: 6 }} onPress={() => toggle(row.kind, "emailEnabled")}>
                <Ionicons name={row.emailEnabled ? "checkbox" : "square-outline"} size={18} color={row.emailEnabled ? colors.primary : colors.textMuted} />
                <Text style={{ color: colors.text, fontSize: 12 }}>Email</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))
      )}

      <TouchableOpacity
        style={{ backgroundColor: colors.primary, borderRadius: radius.md, alignItems: "center", paddingVertical: 12, opacity: saveMutation.isPending || !rows ? 0.6 : 1 }}
        disabled={saveMutation.isPending || !rows}
        onPress={() => saveMutation.mutate()}
      >
        {saveMutation.isPending ? <ActivityIndicator color="#fff" /> : <Text style={{ color: "#fff", fontWeight: "700", fontSize: 13 }}>Save</Text>}
      </TouchableOpacity>
    </ScrollView>
  );
}
