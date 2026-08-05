import { useQuery } from "@tanstack/react-query";
import { ScrollView, Text, View } from "react-native";
import dayjs from "dayjs";
import { axiosClient } from "../../api/axiosClient";
import { useTheme } from "../../theme/ThemeContext";

interface AgentLogEntry {
  id: number;
  source: string;
  message: string;
  createdAt: string;
}

// Mirrors client/src/pages/appSettings/AgentLogTab.tsx — polls every 5s rather than streaming.
export function AgentLogScreen() {
  const { colors, spacing, radius } = useTheme();

  const { data, isLoading } = useQuery({
    queryKey: ["mobile-agent-log"],
    queryFn: async () => (await axiosClient.get<AgentLogEntry[]>("/system/agent-log")).data,
    refetchInterval: 5000,
  });

  const entries = [...(data ?? [])].reverse();

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: spacing.lg }}>
      <Text style={{ color: colors.textMuted, fontSize: 12, marginBottom: spacing.md }}>
        Recent log lines uploaded by the on-prem network relay agent. Updates every 5 seconds. Entries older than 24 hours are pruned automatically.
      </Text>
      {isLoading && <Text style={{ color: colors.textMuted }}>Loading...</Text>}
      {!isLoading && entries.length === 0 && <Text style={{ color: colors.textMuted }}>No log entries yet — the relay agent hasn't reported in.</Text>}
      {entries.length > 0 && (
        <View style={{ backgroundColor: "#0d1117", borderRadius: radius.md, padding: 12 }}>
          {entries.map((e) => (
            <Text key={e.id} style={{ color: "#c9d1d9", fontSize: 11, fontFamily: "monospace", marginBottom: 4 }}>
              <Text style={{ opacity: 0.6 }}>{dayjs(e.createdAt).format("HH:mm:ss")}</Text> {e.message}
            </Text>
          ))}
        </View>
      )}
    </ScrollView>
  );
}
