import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Text, TextInput, TouchableOpacity, View } from "react-native";
import dayjs from "dayjs";
import { axiosClient } from "../../api/axiosClient";
import { useTheme } from "../../theme/ThemeContext";
import { StatusPill } from "../../components/StatusPill";
import { PickerModal, PickerOption } from "../../components/PickerModal";
import { TicketApproval, TicketUserRef } from "../../types/ticket";

interface TeamRef {
  id: number;
  name: string;
  members?: { user: { id: number } }[];
}

// Mobile port of client/src/pages/helpdesk/TicketApprovalsTab.tsx.
export function TicketApprovalsTab({
  ticketId,
  approvals,
  users,
  teams,
  currentUserId,
  canEdit,
}: {
  ticketId: number;
  approvals: TicketApproval[];
  users: TicketUserRef[];
  teams: TeamRef[];
  currentUserId: number;
  canEdit: boolean;
}) {
  const { colors, spacing, radius } = useTheme();
  const queryClient = useQueryClient();
  const [targetType, setTargetType] = useState<"user" | "team">("user");
  const [targetId, setTargetId] = useState<number | null>(null);
  const [comment, setComment] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [refusingId, setRefusingId] = useState<number | null>(null);
  const [refuseComment, setRefuseComment] = useState("");

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["mobile-ticket", ticketId] });

  const requestMutation = useMutation({
    mutationFn: () =>
      axiosClient.post(`/tickets/${ticketId}/approvals`, {
        targetUserId: targetType === "user" ? targetId : undefined,
        targetTeamId: targetType === "team" ? targetId : undefined,
        comment: comment || undefined,
      }),
    onSuccess: () => { invalidate(); setTargetId(null); setComment(""); },
  });

  const answerMutation = useMutation({
    mutationFn: ({ approvalId, accept, comment: c }: { approvalId: number; accept: boolean; comment?: string }) =>
      axiosClient.post(`/tickets/${ticketId}/approvals/${approvalId}/answer`, { accept, comment: c }),
    onSuccess: () => { invalidate(); setRefusingId(null); setRefuseComment(""); },
  });

  function isTargetOfApproval(a: TicketApproval) {
    if (a.targetUserId === currentUserId) return true;
    if (a.targetTeamId) {
      const team = teams.find((t) => t.id === a.targetTeamId);
      return Boolean(team?.members?.some((m) => m.user.id === currentUserId));
    }
    return false;
  }

  const targetOptions: PickerOption[] = targetType === "user" ? users.map((u) => ({ id: u.id, label: `${u.firstName} ${u.lastName}` })) : teams.map((t) => ({ id: t.id, label: t.name }));
  const inputStyle = { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 10, fontSize: 13, color: colors.text, backgroundColor: colors.bg };

  return (
    <View>
      {(!approvals || approvals.length === 0) && <Text style={{ color: colors.textMuted, fontSize: 12.5 }}>No approvals have been requested.</Text>}
      {approvals?.map((a) => (
        <View key={a.id} style={{ paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <StatusPill value={a.status} />
            <Text style={{ color: colors.textMuted, fontSize: 11 }}>
              Requested by {a.requestedBy.firstName} {a.requestedBy.lastName} on {dayjs(a.createdAt).format("DD MMM YYYY")}
            </Text>
          </View>
          <Text style={{ color: colors.text, fontSize: 13, marginTop: 4 }}>
            Target: <Text style={{ fontWeight: "700" }}>{a.targetUser ? `${a.targetUser.firstName} ${a.targetUser.lastName}` : a.targetTeam?.name}</Text>
          </Text>
          {a.comment && <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }}>"{a.comment}"</Text>}
          {a.answeredBy && (
            <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 4 }}>
              {a.status === "ACCEPTED" ? "Approved" : "Refused"} by {a.answeredBy.firstName} {a.answeredBy.lastName} on {dayjs(a.answeredAt!).format("DD MMM YYYY")}
              {a.answerComment && ` — "${a.answerComment}"`}
            </Text>
          )}
          {a.status === "WAITING" && isTargetOfApproval(a) && (
            <View style={{ marginTop: 8, gap: 8 }}>
              {refusingId === a.id ? (
                <>
                  <TextInput style={inputStyle} placeholder="Explain why you're refusing..." placeholderTextColor={colors.textMuted} value={refuseComment} onChangeText={setRefuseComment} />
                  <View style={{ flexDirection: "row", gap: 8 }}>
                    <TouchableOpacity style={{ backgroundColor: colors.danger, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 8, opacity: refuseComment.trim() ? 1 : 0.6 }} disabled={!refuseComment.trim() || answerMutation.isPending} onPress={() => answerMutation.mutate({ approvalId: a.id, accept: false, comment: refuseComment })}>
                      <Text style={{ color: "#fff", fontSize: 12, fontWeight: "700" }}>Confirm Refuse</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={{ borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 8 }} onPress={() => setRefusingId(null)}>
                      <Text style={{ color: colors.text, fontSize: 12, fontWeight: "700" }}>Cancel</Text>
                    </TouchableOpacity>
                  </View>
                </>
              ) : (
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <TouchableOpacity style={{ backgroundColor: colors.primary, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 8 }} disabled={answerMutation.isPending} onPress={() => answerMutation.mutate({ approvalId: a.id, accept: true })}>
                    <Text style={{ color: "#fff", fontSize: 12, fontWeight: "700" }}>Approve</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={{ borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 8 }} onPress={() => setRefusingId(a.id)}>
                    <Text style={{ color: colors.text, fontSize: 12, fontWeight: "700" }}>Refuse</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          )}
        </View>
      ))}

      {canEdit && (
        <View style={{ marginTop: spacing.md, gap: 8 }}>
          <View style={{ flexDirection: "row", gap: 8 }}>
            {(["user", "team"] as const).map((t) => (
              <TouchableOpacity key={t} style={{ borderWidth: 1, borderColor: targetType === t ? colors.primary : colors.border, backgroundColor: targetType === t ? colors.primary + "22" : colors.bg, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 8 }} onPress={() => { setTargetType(t); setTargetId(null); }}>
                <Text style={{ color: targetType === t ? colors.primary : colors.text, fontSize: 12, fontWeight: "700" }}>{t === "user" ? "User" : "Team"}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <TouchableOpacity style={inputStyle} onPress={() => setPickerOpen(true)}>
            <Text style={{ color: targetId ? colors.text : colors.textMuted, fontSize: 13 }}>
              {targetId ? targetOptions.find((o) => o.id === targetId)?.label : targetType === "user" ? "Select a user..." : "Select a team..."}
            </Text>
          </TouchableOpacity>
          <TextInput style={inputStyle} placeholder="Optional comment" placeholderTextColor={colors.textMuted} value={comment} onChangeText={setComment} />
          <TouchableOpacity style={{ backgroundColor: colors.primary, borderRadius: radius.md, alignItems: "center", paddingVertical: 11, alignSelf: "flex-start", paddingHorizontal: 18, opacity: targetId ? 1 : 0.6 }} disabled={!targetId || requestMutation.isPending} onPress={() => requestMutation.mutate()}>
            <Text style={{ color: "#fff", fontWeight: "700", fontSize: 12.5 }}>Request Approval</Text>
          </TouchableOpacity>
        </View>
      )}

      <PickerModal visible={pickerOpen} title={targetType === "user" ? "Select User" : "Select Team"} options={targetOptions} selectedId={targetId} searchable onSelect={(v) => setTargetId(v as number | null)} onClose={() => setPickerOpen(false)} />
    </View>
  );
}
