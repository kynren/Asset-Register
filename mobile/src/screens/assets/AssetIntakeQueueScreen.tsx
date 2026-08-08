import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { ActivityIndicator, FlatList, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import dayjs from "dayjs";
import { axiosClient } from "../../api/axiosClient";
import { useAuth } from "../../auth/AuthContext";
import { useTheme } from "../../theme/ThemeContext";
import { ShimmerList } from "../../components/Shimmer";
import { PickerModal, PickerOption } from "../../components/PickerModal";
import { AssetsStackParamList } from "../../navigation/types";

type SubmissionStatus = "PENDING" | "APPROVED" | "REJECTED";

interface Submission {
  id: number;
  category: { id: number; name: string };
  name: string;
  submitterName: string | null;
  submitterEmail: string | null;
  fieldValues: Record<string, string>;
  status: SubmissionStatus;
  reviewNotes: string | null;
  resultingAssetId: number | null;
  createdAt: string;
}

const STATUS_OPTIONS: PickerOption[] = [
  { id: "PENDING", label: "Pending review" },
  { id: "APPROVED", label: "Approved" },
  { id: "REJECTED", label: "Rejected" },
];

// Mirrors client/src/pages/assets/AssetIntakeQueuePage.tsx — review queue for
// AssetCategory.publicIntakeToken submissions. Nothing here becomes an Asset until approved.
export function AssetIntakeQueueScreen() {
  const { colors, spacing, radius } = useTheme();
  const { hasPermission } = useAuth();
  const navigation = useNavigation<NativeStackNavigationProp<AssetsStackParamList>>();
  const queryClient = useQueryClient();
  const canEdit = hasPermission("assets", "edit");

  const [status, setStatus] = useState<SubmissionStatus>("PENDING");
  const [statusPickerOpen, setStatusPickerOpen] = useState(false);
  const [rejecting, setRejecting] = useState<Submission | null>(null);
  const [reviewNotes, setReviewNotes] = useState("");

  const { data: submissions, isLoading } = useQuery({
    queryKey: ["mobile-asset-intake-submissions", status],
    queryFn: async () => (await axiosClient.get("/asset-intake-submissions", { params: { status } })).data as Submission[],
  });

  function invalidate() { queryClient.invalidateQueries({ queryKey: ["mobile-asset-intake-submissions"] }); }

  const approveMutation = useMutation({ mutationFn: (id: number) => axiosClient.post(`/asset-intake-submissions/${id}/approve`), onSuccess: invalidate });
  const rejectMutation = useMutation({
    mutationFn: () => axiosClient.post(`/asset-intake-submissions/${rejecting!.id}/reject`, { reviewNotes: reviewNotes || undefined }),
    onSuccess: () => { invalidate(); setRejecting(null); setReviewNotes(""); },
  });

  const inputStyle = { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: colors.text, backgroundColor: colors.bg };

  if (isLoading) return <ShimmerList />;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ padding: spacing.lg, paddingBottom: spacing.sm }}>
        <TouchableOpacity style={[inputStyle, { backgroundColor: colors.surface }]} onPress={() => setStatusPickerOpen(true)}>
          <Text style={{ color: colors.text, fontSize: 13 }}>{STATUS_OPTIONS.find((o) => o.id === status)?.label}</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={submissions ?? []}
        keyExtractor={(s) => String(s.id)}
        contentContainerStyle={{ padding: spacing.lg, paddingTop: 0, gap: spacing.sm }}
        ListEmptyComponent={<Text style={{ color: colors.textMuted, textAlign: "center", marginTop: 40 }}>No {status.toLowerCase()} submissions.</Text>}
        renderItem={({ item: s }) => (
          <View style={{ backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md }}>
            <Text style={{ color: colors.text, fontSize: 14, fontWeight: "700" }}>{s.name}</Text>
            <Text style={{ color: colors.textMuted, fontSize: 11.5, marginTop: 4 }}>
              {s.category.name} · Submitted {dayjs(s.createdAt).format("DD MMM YYYY HH:mm")}
              {s.submitterName ? ` · ${s.submitterName}` : ""}{s.submitterEmail ? ` (${s.submitterEmail})` : ""}
            </Text>

            {Object.keys(s.fieldValues ?? {}).length > 0 && (
              <View style={{ marginTop: 8, gap: 2 }}>
                {Object.entries(s.fieldValues).map(([key, value]) => (
                  <Text key={key} style={{ color: colors.textMuted, fontSize: 11.5 }}><Text style={{ fontWeight: "600" }}>{key}:</Text> {value}</Text>
                ))}
              </View>
            )}
            {s.reviewNotes && <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 6, fontStyle: "italic" }}>Note: {s.reviewNotes}</Text>}

            {s.status === "PENDING" && canEdit ? (
              <View style={{ flexDirection: "row", gap: 8, marginTop: 10 }}>
                <TouchableOpacity style={{ flex: 1, borderWidth: 1, borderColor: colors.danger, borderRadius: radius.md, alignItems: "center", paddingVertical: 9 }} onPress={() => setRejecting(s)}>
                  <Text style={{ color: colors.danger, fontWeight: "700", fontSize: 12.5 }}>Reject</Text>
                </TouchableOpacity>
                <TouchableOpacity style={{ flex: 1, backgroundColor: colors.primary, borderRadius: radius.md, alignItems: "center", paddingVertical: 9 }} disabled={approveMutation.isPending} onPress={() => approveMutation.mutate(s.id)}>
                  {approveMutation.isPending ? <ActivityIndicator size="small" color="#fff" /> : <Text style={{ color: "#fff", fontWeight: "700", fontSize: 12.5 }}>Approve</Text>}
                </TouchableOpacity>
              </View>
            ) : s.status === "APPROVED" && s.resultingAssetId ? (
              <TouchableOpacity style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 10, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingVertical: 9 }} onPress={() => navigation.navigate("AssetDetail", { id: s.resultingAssetId! })}>
                <Text style={{ color: colors.text, fontWeight: "700", fontSize: 12.5 }}>View Asset</Text>
                <Ionicons name="arrow-forward" size={13} color={colors.text} />
              </TouchableOpacity>
            ) : s.status === "REJECTED" ? (
              <View style={{ backgroundColor: colors.danger + "22", borderRadius: radius.pill, alignSelf: "flex-start", paddingHorizontal: 10, paddingVertical: 3, marginTop: 8 }}>
                <Text style={{ color: colors.danger, fontSize: 10.5, fontWeight: "700" }}>REJECTED</Text>
              </View>
            ) : null}
          </View>
        )}
      />

      {rejecting && (
        <View style={{ position: "absolute", inset: 0, backgroundColor: "#0008", justifyContent: "flex-end" }}>
          <View style={{ backgroundColor: colors.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: spacing.lg }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.sm }}>
              <Text style={{ color: colors.text, fontSize: 15, fontWeight: "700" }}>Reject "{rejecting.name}"</Text>
              <TouchableOpacity onPress={() => { setRejecting(null); setReviewNotes(""); }}><Ionicons name="close" size={22} color={colors.textMuted} /></TouchableOpacity>
            </View>
            <TextInput style={[inputStyle, { minHeight: 70, textAlignVertical: "top" }]} placeholder="Why is this being rejected? (optional)" placeholderTextColor={colors.textMuted} value={reviewNotes} onChangeText={setReviewNotes} multiline />
            <TouchableOpacity style={{ backgroundColor: colors.danger, borderRadius: radius.md, alignItems: "center", paddingVertical: 12, marginTop: spacing.md }} disabled={rejectMutation.isPending} onPress={() => rejectMutation.mutate()}>
              {rejectMutation.isPending ? <ActivityIndicator color="#fff" /> : <Text style={{ color: "#fff", fontWeight: "700", fontSize: 13 }}>Reject Submission</Text>}
            </TouchableOpacity>
          </View>
        </View>
      )}

      <PickerModal visible={statusPickerOpen} title="Status" options={STATUS_OPTIONS} selectedId={status} onSelect={(id) => setStatus(id as SubmissionStatus)} onClose={() => setStatusPickerOpen(false)} />
    </View>
  );
}
