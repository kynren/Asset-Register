import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Text, TextInput, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { axiosClient } from "../../api/axiosClient";
import { useAuth } from "../../auth/AuthContext";
import { useTheme } from "../../theme/ThemeContext";
import { TicketKnowledgeLink } from "../../types/ticket";

interface KbArticle {
  id: number;
  title: string;
  category: string | null;
}

// Mobile port of client/src/pages/helpdesk/TicketKnowledgeTab.tsx.
export function TicketKnowledgeTab({ ticketId, knowledgeArticles, canEdit }: { ticketId: number; knowledgeArticles: TicketKnowledgeLink[]; canEdit: boolean }) {
  const { colors, spacing, radius } = useTheme();
  const { hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const canSearchKb = hasPermission("operations", "view");
  const [search, setSearch] = useState("");

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["mobile-ticket", ticketId] });

  const { data: searchResults } = useQuery({
    queryKey: ["mobile-kb-search", search],
    queryFn: async () => (await axiosClient.get("/operations/knowledge", { params: { search: search || undefined } })).data as KbArticle[],
    enabled: canSearchKb,
  });

  const attachMutation = useMutation({
    mutationFn: (articleId: number) => axiosClient.post(`/tickets/${ticketId}/knowledge-articles`, { articleId }),
    onSuccess: invalidate,
  });
  const detachMutation = useMutation({
    mutationFn: (linkId: number) => axiosClient.delete(`/tickets/${ticketId}/knowledge-articles/${linkId}`),
    onSuccess: invalidate,
  });

  const attachedIds = new Set((knowledgeArticles ?? []).map((k) => k.article.id));

  return (
    <View>
      {(!knowledgeArticles || knowledgeArticles.length === 0) && <Text style={{ color: colors.textMuted, fontSize: 12.5 }}>No knowledge base articles attached.</Text>}
      {knowledgeArticles?.map((k) => (
        <View key={k.id} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flex: 1 }}>
            <Ionicons name="book-outline" size={14} color={colors.text} />
            <Text style={{ color: colors.text, fontSize: 13, flex: 1 }} numberOfLines={1}>{k.article.title}</Text>
          </View>
          {canEdit && (
            <TouchableOpacity style={{ width: 28, height: 28, alignItems: "center", justifyContent: "center", borderRadius: radius.md, borderWidth: 1, borderColor: colors.danger }} onPress={() => detachMutation.mutate(k.id)}>
              <Ionicons name="trash-outline" size={13} color={colors.danger} />
            </TouchableOpacity>
          )}
        </View>
      ))}

      {canEdit && (
        <View style={{ marginTop: spacing.md }}>
          {canSearchKb ? (
            <View style={{ gap: 8 }}>
              <TextInput
                style={{ borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 10, fontSize: 13, color: colors.text, backgroundColor: colors.bg }}
                placeholder="Search knowledge base articles..."
                placeholderTextColor={colors.textMuted}
                value={search}
                onChangeText={setSearch}
              />
              {searchResults?.filter((a) => !attachedIds.has(a.id)).map((a) => (
                <View key={a.id} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 8, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md }}>
                  <View style={{ flex: 1, marginRight: 8 }}>
                    <Text style={{ color: colors.text, fontSize: 12.5 }} numberOfLines={1}>{a.title}</Text>
                    {a.category && <Text style={{ color: colors.textMuted, fontSize: 10.5, marginTop: 2 }}>{a.category}</Text>}
                  </View>
                  <TouchableOpacity style={{ borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 10, paddingVertical: 5 }} disabled={attachMutation.isPending} onPress={() => attachMutation.mutate(a.id)}>
                    <Text style={{ color: colors.text, fontSize: 11, fontWeight: "700" }}>Attach</Text>
                  </TouchableOpacity>
                </View>
              ))}
              {searchResults && searchResults.filter((a) => !attachedIds.has(a.id)).length === 0 && (
                <Text style={{ color: colors.textMuted, fontSize: 11.5 }}>No matching articles.</Text>
              )}
            </View>
          ) : (
            <Text style={{ color: colors.textMuted, fontSize: 11.5 }}>You don't have access to search the knowledge base.</Text>
          )}
        </View>
      )}
    </View>
  );
}
