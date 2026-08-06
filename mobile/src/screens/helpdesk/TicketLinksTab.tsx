import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Alert, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { axiosClient } from "../../api/axiosClient";
import { useTheme } from "../../theme/ThemeContext";
import { TicketStatusPill } from "../../components/TicketPills";
import { TicketLink } from "../../types/ticket";
import { HelpdeskStackParamList } from "../../navigation/types";

const LINK_TYPE_LABELS: Record<string, string> = {
  RELATES_TO: "Relates to",
  CAUSES: "Causes",
  CAUSED_BY: "Caused by",
  DUPLICATES: "Duplicates",
};
const LINK_TYPES = Object.keys(LINK_TYPE_LABELS);

// Mobile port of client/src/pages/helpdesk/TicketLinksTab.tsx.
export function TicketLinksTab({ ticketId, linksFrom, linksTo, canEdit }: { ticketId: number; linksFrom: TicketLink[]; linksTo: TicketLink[]; canEdit: boolean }) {
  const { colors, spacing, radius } = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<HelpdeskStackParamList>>();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [linkType, setLinkType] = useState("RELATES_TO");

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["mobile-ticket", ticketId] });

  const { data: searchResults } = useQuery({
    queryKey: ["mobile-ticket-link-search", search],
    queryFn: async () => (await axiosClient.get("/tickets", { params: { search, pageSize: 8 } })).data.items,
    enabled: search.trim().length > 1,
  });

  const linkMutation = useMutation({
    mutationFn: (linkedTicketId: number) => axiosClient.post(`/tickets/${ticketId}/links`, { linkedTicketId, linkType }),
    onSuccess: () => { invalidate(); setSearch(""); },
  });

  const unlinkMutation = useMutation({
    mutationFn: (linkId: number) => axiosClient.delete(`/tickets/${ticketId}/links/${linkId}`),
    onSuccess: invalidate,
  });

  const combined = [
    ...(linksFrom ?? []).map((l) => ({ id: l.id, type: l.linkType, ticket: l.linkedTicket!, deletable: true, reverse: false })),
    ...(linksTo ?? []).map((l) => ({ id: l.id, type: l.linkType, ticket: l.ticket!, deletable: false, reverse: true })),
  ];
  const inputStyle = { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 10, fontSize: 13, color: colors.text, backgroundColor: colors.bg };

  function confirmUnlink(link: (typeof combined)[number]) {
    Alert.alert("Unlink ticket", `Remove the link to ${link.ticket.ticketNumber} — ${link.ticket.title}?`, [
      { text: "Cancel", style: "cancel" },
      { text: "Unlink", style: "destructive", onPress: () => unlinkMutation.mutate(link.id) },
    ]);
  }

  return (
    <View>
      {combined.length === 0 && <Text style={{ color: colors.textMuted, fontSize: 12.5 }}>No linked tickets.</Text>}
      {combined.map((l) => (
        <View key={`${l.reverse ? "to" : "from"}-${l.id}`} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border }}>
          <TouchableOpacity style={{ flex: 1 }} onPress={() => navigation.navigate("TicketDetail", { id: l.ticket.id })}>
            <Text style={{ color: colors.textMuted, fontSize: 10.5 }}>{l.reverse ? `${LINK_TYPE_LABELS[l.type] ?? l.type} this` : LINK_TYPE_LABELS[l.type] ?? l.type}</Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 }}>
              <Text style={{ color: colors.primary, fontSize: 13, fontWeight: "700", flexShrink: 1 }} numberOfLines={1}>{l.ticket.ticketNumber} — {l.ticket.title}</Text>
              <TicketStatusPill status={l.ticket.status} />
            </View>
          </TouchableOpacity>
          {l.deletable && canEdit && (
            <TouchableOpacity style={{ width: 28, height: 28, alignItems: "center", justifyContent: "center", borderRadius: radius.md, borderWidth: 1, borderColor: colors.danger, marginLeft: 8 }} onPress={() => confirmUnlink(l)}>
              <Ionicons name="trash-outline" size={13} color={colors.danger} />
            </TouchableOpacity>
          )}
        </View>
      ))}

      {canEdit && (
        <View style={{ marginTop: spacing.md, gap: 8 }}>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
            {LINK_TYPES.map((t) => (
              <TouchableOpacity key={t} style={{ borderWidth: 1, borderColor: linkType === t ? colors.primary : colors.border, backgroundColor: linkType === t ? colors.primary + "22" : colors.bg, borderRadius: radius.md, paddingHorizontal: 10, paddingVertical: 6 }} onPress={() => setLinkType(t)}>
                <Text style={{ color: linkType === t ? colors.primary : colors.text, fontSize: 11.5, fontWeight: "600" }}>{LINK_TYPE_LABELS[t]}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <TextInput style={inputStyle} placeholder="Search tickets by number or title..." placeholderTextColor={colors.textMuted} value={search} onChangeText={setSearch} />
          {search.trim().length > 1 && (
            <View style={{ borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: 6, maxHeight: 200 }}>
              {searchResults?.filter((t: any) => t.id !== ticketId).length ? (
                searchResults.filter((t: any) => t.id !== ticketId).map((t: any) => (
                  <View key={t.id} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 6, paddingHorizontal: 4 }}>
                    <Text style={{ color: colors.text, fontSize: 12.5, flex: 1, marginRight: 8 }} numberOfLines={1}>{t.ticketNumber} — {t.title}</Text>
                    <TouchableOpacity style={{ borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 10, paddingVertical: 5 }} disabled={linkMutation.isPending} onPress={() => linkMutation.mutate(t.id)}>
                      <Text style={{ color: colors.text, fontSize: 11, fontWeight: "700" }}>Link</Text>
                    </TouchableOpacity>
                  </View>
                ))
              ) : (
                <Text style={{ color: colors.textMuted, fontSize: 11.5, padding: 4 }}>No matching tickets.</Text>
              )}
            </View>
          )}
        </View>
      )}
    </View>
  );
}
