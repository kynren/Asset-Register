import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import dayjs from "dayjs";
import { axiosClient } from "../../api/axiosClient";
import { useAuth } from "../../auth/AuthContext";
import { useTheme } from "../../theme/ThemeContext";
import { PickerModal, PickerOption } from "../../components/PickerModal";
import { TicketPriorityPill, TicketStatusPill } from "../../components/TicketPills";
import { ShimmerDetail } from "../../components/Shimmer";
import { useToast } from "../../components/toast/ToastProvider";
import { downloadAndShare } from "../../lib/downloadFile";
import { Ticket, TicketAttachment, TicketUserRef, TICKET_STATUS_OPTIONS } from "../../types/ticket";
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

const ITIL_TYPE_LABELS: Record<string, string> = { INCIDENT: "Incident", REQUEST: "Request", PROBLEM: "Problem", CHANGE: "Change" };
const TICKET_TYPE_LABELS: Record<string, string> = { ACTION: "Action", INFORMATION: "Information" };

// GLPI-parity tab bar mirrors client/src/pages/helpdesk/TicketDetailPage.tsx's 6 tabs. Overview
// keeps the original single-screen layout (status/details/comments); the other 5 delegate to
// per-tab components ported 1:1 from their web counterparts.
export function TicketDetailScreen() {
  const { colors, spacing, radius } = useTheme();
  const { user, hasPermission } = useAuth();
  const { showToast } = useToast();
  const route = useRoute<RouteProp<HelpdeskStackParamList, "TicketDetail">>();
  const navigation = useNavigation<NativeStackNavigationProp<HelpdeskStackParamList>>();
  const { id } = route.params;
  const queryClient = useQueryClient();

  const [tab, setTab] = useState<Tab>("overview");
  const [comment, setComment] = useState("");
  const [isInternal, setIsInternal] = useState(false);
  const [commentFile, setCommentFile] = useState<DocumentPicker.DocumentPickerAsset | null>(null);
  const [statusPickerOpen, setStatusPickerOpen] = useState(false);
  const [ratingValue, setRatingValue] = useState(5);
  const [ratingComment, setRatingComment] = useState("");
  const [uploadingAttachment, setUploadingAttachment] = useState(false);

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
    mutationFn: () => axiosClient.post(`/tickets/${id}/comments`, { body: comment, isInternal }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mobile-ticket", id] });
    },
  });

  const uploadAttachmentMutation = useMutation({
    mutationFn: ({ file, commentId }: { file: DocumentPicker.DocumentPickerAsset; commentId?: number }) => {
      const fd = new FormData();
      fd.append("file", { uri: file.uri, name: file.name, type: file.mimeType ?? "application/octet-stream" } as any);
      if (commentId) fd.append("commentId", String(commentId));
      return axiosClient.post(`/tickets/${id}/attachments`, fd, { headers: { "Content-Type": "multipart/form-data" } });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["mobile-ticket", id] }),
  });

  const deleteAttachmentMutation = useMutation({
    mutationFn: (attachmentId: number) => axiosClient.delete(`/tickets/${id}/attachments/${attachmentId}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["mobile-ticket", id] }),
  });

  async function pickCommentFile() {
    const res = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true });
    if (res.canceled || !res.assets?.[0]) return;
    setCommentFile(res.assets[0]);
  }

  async function sendComment() {
    if (!comment.trim()) return;
    const fileToAttach = commentFile;
    setCommentFile(null);
    const res = await commentMutation.mutateAsync();
    setComment("");
    setIsInternal(false);
    if (fileToAttach) {
      try {
        await uploadAttachmentMutation.mutateAsync({ file: fileToAttach, commentId: res.data.id });
      } catch {
        showToast({ variant: "error", title: "Attachment failed", message: "The comment was posted but the file couldn't be attached." });
      }
    }
  }

  async function addTicketAttachment() {
    const res = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true });
    if (res.canceled || !res.assets?.[0]) return;
    setUploadingAttachment(true);
    try {
      await uploadAttachmentMutation.mutateAsync({ file: res.assets[0] });
    } catch {
      showToast({ variant: "error", title: "Upload failed", message: "Could not upload this file." });
    } finally {
      setUploadingAttachment(false);
    }
  }

  function confirmDeleteAttachment(attachmentId: number) {
    Alert.alert("Delete attachment", "This file will be permanently deleted.", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => deleteAttachmentMutation.mutate(attachmentId) },
    ]);
  }

  function formatBytes(n: number) {
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  }

  function AttachmentRow({ a }: { a: TicketAttachment }) {
    return (
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 6 }}>
        <TouchableOpacity style={{ flexDirection: "row", alignItems: "center", gap: 6, flex: 1 }} onPress={() => downloadAndShare(`/tickets/${id}/attachments/${a.id}`, a.filename)}>
          <Ionicons name="attach" size={14} color={colors.primary} />
          <Text style={{ color: colors.primary, fontSize: 12.5, flexShrink: 1 }} numberOfLines={1}>{a.filename}</Text>
          <Text style={{ color: colors.textMuted, fontSize: 11 }}>({formatBytes(a.sizeBytes)})</Text>
        </TouchableOpacity>
        {canEdit && (
          <TouchableOpacity onPress={() => confirmDeleteAttachment(a.id)} style={{ padding: 4 }}>
            <Ionicons name="trash-outline" size={14} color={colors.danger} />
          </TouchableOpacity>
        )}
      </View>
    );
  }

  const watchMutation = useMutation({
    mutationFn: () => axiosClient.post(`/tickets/${id}/watch`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["mobile-ticket", id] }),
  });

  const satisfactionMutation = useMutation({
    mutationFn: () => axiosClient.post(`/tickets/${id}/satisfaction`, { rating: ratingValue, comment: ratingComment || undefined }),
    onSuccess: () => {
      setRatingComment("");
      queryClient.invalidateQueries({ queryKey: ["mobile-ticket", id] });
    },
    onError: () => showToast({ variant: "error", title: "Couldn't submit rating", message: "Please try again." }),
  });

  if (isLoading || !ticket) {
    return <ShimmerDetail />;
  }

  const statusOptions: PickerOption[] = TICKET_STATUS_OPTIONS.map((s) => ({ id: s.value, label: s.label }));
  const isOverdue = !!ticket.dueAt && !["RESOLVED", "CLOSED"].includes(ticket.status) && dayjs(ticket.dueAt).isBefore(dayjs());
  const canRate = user?.id === ticket.requesterId && ["RESOLVED", "CLOSED"].includes(ticket.status) && !ticket.satisfactionRating;

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
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.textMuted, fontSize: 12, fontWeight: "700" }}>{ticket.ticketNumber}</Text>
                <Text style={{ color: colors.text, fontSize: 18, fontWeight: "800", marginTop: 4 }}>{ticket.title}</Text>
              </View>
              <TouchableOpacity
                style={{ flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.pill, borderWidth: 1, borderColor: ticket.isWatching ? colors.primary : colors.border, backgroundColor: ticket.isWatching ? colors.primary + "18" : "transparent" }}
                disabled={watchMutation.isPending}
                onPress={() => watchMutation.mutate()}
              >
                <Ionicons name={ticket.isWatching ? "notifications" : "notifications-outline"} size={13} color={ticket.isWatching ? colors.primary : colors.textMuted} />
                <Text style={{ color: ticket.isWatching ? colors.primary : colors.textMuted, fontSize: 11, fontWeight: "700" }}>{ticket.isWatching ? "Watching" : "Watch"}</Text>
              </TouchableOpacity>
            </View>

            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: spacing.sm }}>
              <TouchableOpacity disabled={!canEdit} onPress={() => setStatusPickerOpen(true)}>
                <TicketStatusPill status={ticket.status} />
              </TouchableOpacity>
              <TicketPriorityPill priority={ticket.priority} />
              <View style={{ backgroundColor: colors.textMuted + "22", borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 3 }}>
                <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: "700" }}>{ITIL_TYPE_LABELS[ticket.itilType] ?? ticket.itilType}</Text>
              </View>
              <View style={{ backgroundColor: colors.textMuted + "22", borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 3 }}>
                <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: "700" }}>{TICKET_TYPE_LABELS[ticket.type] ?? ticket.type}</Text>
              </View>
              {isOverdue && (
                <View style={{ backgroundColor: colors.danger + "22", borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 3 }}>
                  <Text style={{ color: colors.danger, fontSize: 11, fontWeight: "700" }}>OVERDUE</Text>
                </View>
              )}
            </View>

            <Text style={{ color: colors.text, fontSize: 14, lineHeight: 20, marginTop: spacing.lg }}>{ticket.description}</Text>

            <View style={{ backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, marginTop: spacing.lg, paddingHorizontal: spacing.lg }}>
              {(
                [
                  ["Requester", ticket.requester ? `${ticket.requester.firstName} ${ticket.requester.lastName}` : "—", undefined],
                  ["Assigned to", ticket.assignees.length ? ticket.assignees.map((a) => `${a.user.firstName} ${a.user.lastName}`).join(", ") : "Unassigned", undefined],
                  ["Teams", ticket.assignedTeams?.length ? ticket.assignedTeams.map((t) => t.team.name).join(", ") : "No team", undefined],
                  ["Category", ticket.category?.name ?? "—", undefined],
                  ["Location", ticket.location?.name ?? "—", undefined],
                  ["Asset", ticket.asset ? `${ticket.asset.name} (${ticket.asset.assetTag})` : "—", ticket.asset ? () => (navigation.getParent() as any)?.navigate("AssetsTab", { screen: "AssetDetail", params: { id: ticket.asset!.id } }) : undefined],
                  ["Due", ticket.dueAt ? dayjs(ticket.dueAt).format("DD MMM YYYY HH:mm") : "—", undefined],
                ] as [string, string, (() => void) | undefined][]
              ).map(([label, value, onPress], i, arr) => {
                const Row = onPress ? TouchableOpacity : View;
                return (
                  <Row key={label} style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 12, borderBottomWidth: i < arr.length - 1 ? 1 : 0, borderBottomColor: colors.border }} onPress={onPress}>
                    <Text style={{ color: colors.textMuted, fontSize: 13 }}>{label}</Text>
                    <Text style={{ color: label === "Due" && isOverdue ? colors.danger : onPress ? colors.primary : colors.text, fontSize: 13, fontWeight: "600", flexShrink: 1, textAlign: "right" }}>{value}</Text>
                  </Row>
                );
              })}
            </View>

            {ticket.satisfactionRating != null && (
              <View style={{ backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, marginTop: spacing.md, padding: spacing.md }}>
                <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: "700", textTransform: "uppercase", marginBottom: 4 }}>Satisfaction</Text>
                <Text style={{ color: colors.warning, fontSize: 16 }}>{"★".repeat(ticket.satisfactionRating)}{"☆".repeat(5 - ticket.satisfactionRating)}</Text>
                {ticket.satisfactionComment && <Text style={{ color: colors.text, fontSize: 13, marginTop: 4, fontStyle: "italic" }}>"{ticket.satisfactionComment}"</Text>}
              </View>
            )}

            {canRate && (
              <View style={{ backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, marginTop: spacing.md, padding: spacing.md }}>
                <Text style={{ color: colors.text, fontSize: 13, fontWeight: "700", marginBottom: 8 }}>Rate this resolution</Text>
                <View style={{ flexDirection: "row", gap: 4, marginBottom: 8 }}>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <TouchableOpacity key={n} onPress={() => setRatingValue(n)}>
                      <Ionicons name={n <= ratingValue ? "star" : "star-outline"} size={26} color={colors.warning} />
                    </TouchableOpacity>
                  ))}
                </View>
                <TextInput
                  style={{ borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 8, color: colors.text, fontSize: 13 }}
                  placeholder="Optional feedback..."
                  placeholderTextColor={colors.textMuted}
                  value={ratingComment}
                  onChangeText={setRatingComment}
                  multiline
                />
                <TouchableOpacity
                  style={{ backgroundColor: colors.primary, borderRadius: radius.md, alignItems: "center", paddingVertical: 10, marginTop: 8, opacity: satisfactionMutation.isPending ? 0.6 : 1 }}
                  disabled={satisfactionMutation.isPending}
                  onPress={() => satisfactionMutation.mutate()}
                >
                  <Text style={{ color: "#fff", fontWeight: "700", fontSize: 13 }}>{satisfactionMutation.isPending ? "Submitting..." : "Submit Rating"}</Text>
                </TouchableOpacity>
              </View>
            )}

            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: spacing.lg, marginBottom: 8 }}>
              <Text style={{ color: colors.textMuted, fontSize: 12, fontWeight: "700", textTransform: "uppercase" }}>
                Attachments ({(ticket.attachments ?? []).filter((a) => !a.commentId).length})
              </Text>
              {canEdit && (
                <TouchableOpacity onPress={addTicketAttachment} disabled={uploadingAttachment}>
                  {uploadingAttachment ? <ActivityIndicator size="small" color={colors.primary} /> : <Ionicons name="add-circle-outline" size={18} color={colors.primary} />}
                </TouchableOpacity>
              )}
            </View>
            {(ticket.attachments ?? []).filter((a) => !a.commentId).length === 0 ? (
              <Text style={{ color: colors.textMuted, fontSize: 12.5 }}>No attachments yet.</Text>
            ) : (
              (ticket.attachments ?? []).filter((a) => !a.commentId).map((a) => <AttachmentRow key={a.id} a={a} />)
            )}

            <Text style={{ color: colors.textMuted, fontSize: 12, fontWeight: "700", textTransform: "uppercase", marginTop: spacing.lg, marginBottom: 8 }}>
              Comments ({ticket.comments?.length ?? 0})
            </Text>
            {(ticket.comments ?? []).map((c) => {
              const commentAttachments = (ticket.attachments ?? []).filter((a) => a.commentId === c.id);
              return (
                <View key={c.id} style={{ backgroundColor: c.isInternal ? colors.warning + "18" : colors.surface, borderRadius: radius.md, padding: spacing.md, marginBottom: 8, borderWidth: 1, borderColor: colors.border }}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                    <Text style={{ color: colors.text, fontSize: 12.5, fontWeight: "700" }}>{c.author ? `${c.author.firstName} ${c.author.lastName}` : "Unknown"}</Text>
                    <Text style={{ color: colors.textMuted, fontSize: 11 }}>{dayjs(c.createdAt).format("DD MMM HH:mm")}</Text>
                  </View>
                  {c.isInternal && <Text style={{ color: colors.warning, fontSize: 10, fontWeight: "700", marginTop: 2 }}>INTERNAL NOTE</Text>}
                  <Text style={{ color: colors.text, fontSize: 13, marginTop: 6, lineHeight: 18 }}>{c.body}</Text>
                  {commentAttachments.length > 0 && (
                    <View style={{ marginTop: 6, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 4 }}>
                      {commentAttachments.map((a) => <AttachmentRow key={a.id} a={a} />)}
                    </View>
                  )}
                </View>
              );
            })}
          </>
        )}

        {tab === "tasks" && <TicketTasksTab ticketId={ticket.id} tasks={ticket.tasks ?? []} users={users ?? []} currentUserId={user!.id} canEdit={canEdit} />}
        {tab === "solution" && <TicketSolutionTab ticketId={ticket.id} solutions={ticket.solutions ?? []} isRequester={user?.id === ticket.requesterId} canEdit={canEdit} />}
        {tab === "approvals" && <TicketApprovalsTab ticketId={ticket.id} approvals={ticket.approvals ?? []} users={users ?? []} teams={teams ?? []} currentUserId={user!.id} canEdit={canEdit} />}
        {tab === "links" && <TicketLinksTab ticketId={ticket.id} linksFrom={ticket.linksFrom ?? []} linksTo={ticket.linksTo ?? []} canEdit={canEdit} />}
        {tab === "knowledge" && <TicketKnowledgeTab ticketId={ticket.id} knowledgeArticles={ticket.knowledgeArticles ?? []} canEdit={canEdit} />}
      </ScrollView>

      {tab === "overview" && canEdit && (
        <View style={{ padding: spacing.md, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.surface }}>
          {commentFile && (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 6 }}>
              <Ionicons name="attach" size={13} color={colors.textMuted} />
              <Text style={{ color: colors.textMuted, fontSize: 11.5, flex: 1 }} numberOfLines={1}>{commentFile.name}</Text>
              <TouchableOpacity onPress={() => setCommentFile(null)}>
                <Ionicons name="close-circle" size={15} color={colors.textMuted} />
              </TouchableOpacity>
            </View>
          )}
          <View style={{ flexDirection: "row", gap: 8, alignItems: "flex-end" }}>
            <TouchableOpacity onPress={pickCommentFile} style={{ padding: 8 }}>
              <Ionicons name="attach" size={20} color={colors.textMuted} />
            </TouchableOpacity>
            <TextInput
              style={{ flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 10, color: colors.text, maxHeight: 100 }}
              placeholder="Add a comment..."
              placeholderTextColor={colors.textMuted}
              value={comment}
              onChangeText={setComment}
              multiline
            />
            <TouchableOpacity
              style={{ backgroundColor: colors.primary, borderRadius: radius.md, alignItems: "center", justifyContent: "center", paddingHorizontal: 16, paddingVertical: 10 }}
              disabled={!comment.trim() || commentMutation.isPending}
              onPress={sendComment}
            >
              {commentMutation.isPending ? <ActivityIndicator color="#fff" size="small" /> : <Text style={{ color: "#fff", fontWeight: "700" }}>Send</Text>}
            </TouchableOpacity>
          </View>
          <TouchableOpacity style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 8 }} onPress={() => setIsInternal((v) => !v)}>
            <Ionicons name={isInternal ? "checkbox" : "square-outline"} size={16} color={isInternal ? colors.warning : colors.textMuted} />
            <Text style={{ color: isInternal ? colors.warning : colors.textMuted, fontSize: 12, fontWeight: "600" }}>Internal note (not visible to requester)</Text>
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
