import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRoute, RouteProp } from "@react-navigation/native";
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, TouchableOpacity, View } from "react-native";
import dayjs from "dayjs";
import { axiosClient } from "../../api/axiosClient";
import { useAuth } from "../../auth/AuthContext";
import { useTheme } from "../../theme/ThemeContext";
import { PickerModal, PickerOption } from "../../components/PickerModal";
import { TicketPriorityPill, TicketStatusPill } from "../../components/TicketPills";
import { Ticket, TicketUserRef, TICKET_STATUS_OPTIONS } from "../../types/ticket";
import { HelpdeskStackParamList } from "../../navigation/types";
import { TicketTasksTab } from "./TicketTasksTab";
import { TicketSolutionTab } from "./TicketSolutionTab";
import { TicketApprovalsTab } from "./TicketApprovalsTab";
import { TicketLinksTab } from "./TicketLinksTab";
import { TicketKnowledgeTab } from "./TicketKnowledgeTab";

const TABS = ["overview", "tasks", "solution", "approvals", "links", "knowledge"] as const;
type Tab = (typeof TABS)[number];
const TAB_LABELS: Record<Tab, string> = {
  overview: "Overview",
  tasks: "Tasks",
  solution: "Solution",
  approvals: "Approvals",
  links: "Links",
  knowledge: "KB",
};

// GLPI-parity tab bar mirrors client/src/pages/helpdesk/TicketDetailPage.tsx's 6 tabs. Overview
// keeps the original single-screen layout (status/details/comments); the other 5 delegate to
// per-tab components ported 1:1 from their web counterparts.
export function TicketDetailScreen() {
  const { colors, spacing, radius } = useTheme();
  const { user, hasPermission } = useAuth();
  const route = useRoute<RouteProp<HelpdeskStackParamList, "TicketDetail">>();
  const { id } = route.params;
  const queryClient = useQueryClient();

  const [tab, setTab] = useState<Tab>("overview");
  const [comment, setComment] = useState("");
  const [statusPickerOpen, setStatusPickerOpen] = useState(false);

  const canEdit = hasPermission("helpdesk", "edit");

  const { data: ticket, isLoading } = useQuery({
    queryKey: ["mobile-ticket", id],
    queryFn: async () => (await axiosClient.get(`/tickets/${id}`)).data as Ticket,
  });

  const { data: users } = useQuery({
    queryKey: ["mobile-users-directory"],
    queryFn: async () => (await axiosClient.get("/users/directory")).data as TicketUserRef[],
    enabled: canEdit,
  });
  const { data: teams } = useQuery({
    queryKey: ["mobile-teams"],
    queryFn: async () => (await axiosClient.get("/teams")).data as { id: number; name: string; members?: { user: { id: number } }[] }[],
    enabled: canEdit,
  });

  const statusMutation = useMutation({
    mutationFn: (status: string) => axiosClient.patch(`/tickets/${id}/status`, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mobile-ticket", id] });
      queryClient.invalidateQueries({ queryKey: ["mobile-tickets"] });
    },
  });

  const commentMutation = useMutation({
    mutationFn: () => axiosClient.post(`/tickets/${id}/comments`, { body: comment }),
    onSuccess: () => {
      setComment("");
      queryClient.invalidateQueries({ queryKey: ["mobile-ticket", id] });
    },
  });

  if (isLoading || !ticket) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg }}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  const statusOptions: PickerOption[] = TICKET_STATUS_OPTIONS.map((s) => ({ id: s.value, label: s.label }));

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={90}>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, padding: spacing.lg, paddingBottom: spacing.sm, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border }}>
        {TABS.map((t) => (
          <TouchableOpacity
            key={t}
            style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: radius.pill, backgroundColor: tab === t ? colors.primary : colors.bg, borderWidth: 1, borderColor: tab === t ? colors.primary : colors.border }}
            onPress={() => setTab(t)}
          >
            <Text style={{ color: tab === t ? "#fff" : colors.text, fontSize: 12, fontWeight: "700" }}>{TAB_LABELS[t]}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: spacing.lg }}>
        {tab === "overview" && (
          <>
            <Text style={{ color: colors.textMuted, fontSize: 12, fontWeight: "700" }}>{ticket.ticketNumber}</Text>
            <Text style={{ color: colors.text, fontSize: 18, fontWeight: "800", marginTop: 4 }}>{ticket.title}</Text>

            <View style={{ flexDirection: "row", gap: 8, marginTop: spacing.sm }}>
              <TouchableOpacity disabled={!canEdit} onPress={() => setStatusPickerOpen(true)}>
                <TicketStatusPill status={ticket.status} />
              </TouchableOpacity>
              <TicketPriorityPill priority={ticket.priority} />
            </View>

            <Text style={{ color: colors.text, fontSize: 14, lineHeight: 20, marginTop: spacing.lg }}>{ticket.description}</Text>

            <View style={{ backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, marginTop: spacing.lg, paddingHorizontal: spacing.lg }}>
              {[
                ["Requester", ticket.requester ? `${ticket.requester.firstName} ${ticket.requester.lastName}` : "—"],
                ["Assigned to", ticket.assignees.length ? ticket.assignees.map((a) => `${a.user.firstName} ${a.user.lastName}`).join(", ") : "Unassigned"],
                ["Teams", ticket.assignedTeams?.length ? ticket.assignedTeams.map((t) => t.team.name).join(", ") : "No team"],
                ["Category", ticket.category?.name ?? "—"],
                ["Asset", ticket.asset ? `${ticket.asset.name} (${ticket.asset.assetTag})` : "—"],
                ["Due", ticket.dueAt ? dayjs(ticket.dueAt).format("DD MMM YYYY HH:mm") : "—"],
              ].map(([label, value], i, arr) => (
                <View key={label} style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 12, borderBottomWidth: i < arr.length - 1 ? 1 : 0, borderBottomColor: colors.border }}>
                  <Text style={{ color: colors.textMuted, fontSize: 13 }}>{label}</Text>
                  <Text style={{ color: colors.text, fontSize: 13, fontWeight: "600", flexShrink: 1, textAlign: "right" }}>{value}</Text>
                </View>
              ))}
            </View>

            <Text style={{ color: colors.textMuted, fontSize: 12, fontWeight: "700", textTransform: "uppercase", marginTop: spacing.lg, marginBottom: 8 }}>
              Comments ({ticket.comments?.length ?? 0})
            </Text>
            {(ticket.comments ?? []).map((c) => (
              <View key={c.id} style={{ backgroundColor: c.isInternal ? colors.warning + "18" : colors.surface, borderRadius: radius.md, padding: spacing.md, marginBottom: 8, borderWidth: 1, borderColor: colors.border }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                  <Text style={{ color: colors.text, fontSize: 12.5, fontWeight: "700" }}>{c.author ? `${c.author.firstName} ${c.author.lastName}` : "Unknown"}</Text>
                  <Text style={{ color: colors.textMuted, fontSize: 11 }}>{dayjs(c.createdAt).format("DD MMM HH:mm")}</Text>
                </View>
                {c.isInternal && <Text style={{ color: colors.warning, fontSize: 10, fontWeight: "700", marginTop: 2 }}>INTERNAL NOTE</Text>}
                <Text style={{ color: colors.text, fontSize: 13, marginTop: 6, lineHeight: 18 }}>{c.body}</Text>
              </View>
            ))}
          </>
        )}

        {tab === "tasks" && <TicketTasksTab ticketId={ticket.id} tasks={ticket.tasks ?? []} users={users ?? []} currentUserId={user!.id} canEdit={canEdit} />}
        {tab === "solution" && <TicketSolutionTab ticketId={ticket.id} solutions={ticket.solutions ?? []} isRequester={user?.id === ticket.requesterId} canEdit={canEdit} />}
        {tab === "approvals" && <TicketApprovalsTab ticketId={ticket.id} approvals={ticket.approvals ?? []} users={users ?? []} teams={teams ?? []} currentUserId={user!.id} canEdit={canEdit} />}
        {tab === "links" && <TicketLinksTab ticketId={ticket.id} linksFrom={ticket.linksFrom ?? []} linksTo={ticket.linksTo ?? []} canEdit={canEdit} />}
        {tab === "knowledge" && <TicketKnowledgeTab ticketId={ticket.id} knowledgeArticles={ticket.knowledgeArticles ?? []} canEdit={canEdit} />}
      </ScrollView>

      {tab === "overview" && canEdit && (
        <View style={{ flexDirection: "row", gap: 8, padding: spacing.md, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.surface }}>
          <TextInput
            style={{ flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 10, color: colors.text, maxHeight: 100 }}
            placeholder="Add a comment..."
            placeholderTextColor={colors.textMuted}
            value={comment}
            onChangeText={setComment}
            multiline
          />
          <TouchableOpacity
            style={{ backgroundColor: colors.primary, borderRadius: radius.md, alignItems: "center", justifyContent: "center", paddingHorizontal: 16 }}
            disabled={!comment.trim() || commentMutation.isPending}
            onPress={() => commentMutation.mutate()}
          >
            {commentMutation.isPending ? <ActivityIndicator color="#fff" size="small" /> : <Text style={{ color: "#fff", fontWeight: "700" }}>Send</Text>}
          </TouchableOpacity>
        </View>
      )}

      <PickerModal
        visible={statusPickerOpen}
        title="Change status"
        options={statusOptions}
        selectedId={ticket.status}
        onSelect={(v) => statusMutation.mutate(String(v))}
        onClose={() => setStatusPickerOpen(false)}
      />
    </KeyboardAvoidingView>
  );
}
