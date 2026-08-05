import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Text, TextInput, TouchableOpacity, View } from "react-native";
import dayjs from "dayjs";
import { axiosClient } from "../../api/axiosClient";
import { useTheme } from "../../theme/ThemeContext";
import { StatusPill } from "../../components/StatusPill";
import { TicketSolution } from "../../types/ticket";

// Mobile port of client/src/pages/helpdesk/TicketSolutionTab.tsx.
export function TicketSolutionTab({ ticketId, solutions, isRequester, canEdit }: { ticketId: number; solutions: TicketSolution[]; isRequester: boolean; canEdit: boolean }) {
  const { colors, spacing, radius } = useTheme();
  const queryClient = useQueryClient();
  const [content, setContent] = useState("");
  const [refusingId, setRefusingId] = useState<number | null>(null);
  const [refuseComment, setRefuseComment] = useState("");

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["mobile-ticket", ticketId] });

  const proposeMutation = useMutation({
    mutationFn: () => axiosClient.post(`/tickets/${ticketId}/solutions`, { content }),
    onSuccess: () => { invalidate(); setContent(""); },
  });

  const answerMutation = useMutation({
    mutationFn: ({ solutionId, accept, comment }: { solutionId: number; accept: boolean; comment?: string }) =>
      axiosClient.post(`/tickets/${ticketId}/solutions/${solutionId}/answer`, { accept, comment }),
    onSuccess: () => { invalidate(); setRefusingId(null); setRefuseComment(""); },
  });

  const inputStyle = { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 10, fontSize: 13, color: colors.text, backgroundColor: colors.bg };

  return (
    <View>
      {(!solutions || solutions.length === 0) && <Text style={{ color: colors.textMuted, fontSize: 12.5 }}>No solution has been proposed yet.</Text>}
      {solutions?.map((s) => (
        <View key={s.id} style={{ paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <StatusPill value={s.status} />
            <Text style={{ color: colors.text, fontSize: 12, fontWeight: "700" }}>{s.author.firstName} {s.author.lastName}</Text>
            <Text style={{ color: colors.textMuted, fontSize: 10.5 }}>{dayjs(s.createdAt).format("DD MMM HH:mm")}</Text>
          </View>
          <Text style={{ color: colors.text, fontSize: 13, marginTop: 4 }}>{s.content}</Text>
          {s.answeredBy && (
            <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 4 }}>
              {s.status === "ACCEPTED" ? "Accepted" : "Refused"} by {s.answeredBy.firstName} {s.answeredBy.lastName} on {dayjs(s.answeredAt!).format("DD MMM YYYY")}
              {s.answerComment && ` — "${s.answerComment}"`}
            </Text>
          )}
          {isRequester && s.status === "WAITING" && (
            <View style={{ marginTop: 8, gap: 8 }}>
              {refusingId === s.id ? (
                <>
                  <TextInput style={inputStyle} placeholder="Explain why you're refusing this solution..." placeholderTextColor={colors.textMuted} value={refuseComment} onChangeText={setRefuseComment} />
                  <View style={{ flexDirection: "row", gap: 8 }}>
                    <TouchableOpacity style={{ backgroundColor: colors.danger, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 8, opacity: refuseComment.trim() ? 1 : 0.6 }} disabled={!refuseComment.trim() || answerMutation.isPending} onPress={() => answerMutation.mutate({ solutionId: s.id, accept: false, comment: refuseComment })}>
                      <Text style={{ color: "#fff", fontSize: 12, fontWeight: "700" }}>Confirm Refuse</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={{ borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 8 }} onPress={() => setRefusingId(null)}>
                      <Text style={{ color: colors.text, fontSize: 12, fontWeight: "700" }}>Cancel</Text>
                    </TouchableOpacity>
                  </View>
                </>
              ) : (
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <TouchableOpacity style={{ backgroundColor: colors.primary, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 8 }} disabled={answerMutation.isPending} onPress={() => answerMutation.mutate({ solutionId: s.id, accept: true })}>
                    <Text style={{ color: "#fff", fontSize: 12, fontWeight: "700" }}>Accept Solution</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={{ borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 8 }} onPress={() => setRefusingId(s.id)}>
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
          <TextInput style={[inputStyle, { minHeight: 70, textAlignVertical: "top" }]} multiline placeholder="Propose a solution..." placeholderTextColor={colors.textMuted} value={content} onChangeText={setContent} />
          <TouchableOpacity style={{ backgroundColor: colors.primary, borderRadius: radius.md, alignItems: "center", paddingVertical: 11, alignSelf: "flex-start", paddingHorizontal: 18, opacity: content.trim() ? 1 : 0.6 }} disabled={!content.trim() || proposeMutation.isPending} onPress={() => proposeMutation.mutate()}>
            <Text style={{ color: "#fff", fontWeight: "700", fontSize: 12.5 }}>Propose Solution</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}
