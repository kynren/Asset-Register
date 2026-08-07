import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { ActivityIndicator, ScrollView, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { axiosClient } from "../../api/axiosClient";
import { useTheme } from "../../theme/ThemeContext";
import { KeyboardAvoidingScreen } from "../../components/KeyboardAvoidingScreen";
import { PickerModal, PickerOption } from "../../components/PickerModal";
import { SectionsFormEditor } from "./SectionsFormEditor";
import { DOC_CATEGORIES, DOC_TYPES, DOC_TYPE_DESCRIPTIONS, DOC_TYPE_FIELDS, DOC_TYPE_LABELS, DocType, emptySections } from "../../lib/docsConstants";
import { AccessLevel, LEVEL_LABELS } from "../../lib/accessControl";
import { MoreStackParamList } from "../../navigation/types";
import { DocumentDetail } from "../../types/docs";

interface Collection {
  id: number;
  name: string;
}
interface PendingGrant {
  userId?: number;
  teamId?: number;
  level: AccessLevel;
}
interface DirectoryUser {
  id: number;
  firstName: string;
  lastName: string;
}
interface DirectoryTeam {
  id: number;
  name: string;
}

export function DocumentFormScreen() {
  const { colors, spacing, radius } = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<MoreStackParamList>>();
  const route = useRoute<RouteProp<MoreStackParamList, "DocumentForm">>();
  const queryClient = useQueryClient();
  const docId = route.params?.id;

  const { data: existing } = useQuery({
    queryKey: ["mobile-document", docId],
    queryFn: async () => (await axiosClient.get(`/docs/${docId}`)).data as DocumentDetail,
    enabled: docId != null,
  });

  const [docType, setDocType] = useState<DocType>((existing?.docType as DocType) ?? "SOP");
  const [docTypePickerOpen, setDocTypePickerOpen] = useState(false);
  const [title, setTitle] = useState(existing?.title ?? "");
  const [category, setCategory] = useState(existing?.category ?? "");
  const [categoryPickerOpen, setCategoryPickerOpen] = useState(false);
  const [collectionId, setCollectionId] = useState<number | null>(existing?.collectionId ?? null);
  const [collectionPickerOpen, setCollectionPickerOpen] = useState(false);
  const [newCollectionName, setNewCollectionName] = useState("");
  const [showNewCollection, setShowNewCollection] = useState(false);
  const [summary, setSummary] = useState(existing?.summary ?? "");
  const [tagsText, setTagsText] = useState(existing?.tags?.join(", ") ?? "");
  const [reviewDueDate, setReviewDueDate] = useState(existing?.reviewDueDate?.slice(0, 10) ?? "");
  const [isPublished, setIsPublished] = useState(existing?.isPublished ?? true);
  const [sections, setSections] = useState<Record<string, any>>(existing?.sections ?? emptySections("SOP"));
  const [sectionsInitialized, setSectionsInitialized] = useState(docId == null);
  const [pendingGrants, setPendingGrants] = useState<PendingGrant[]>([]);
  const [grantPickerOpen, setGrantPickerOpen] = useState(false);
  const [grantLevel, setGrantLevel] = useState<AccessLevel>("EDIT");
  const [error, setError] = useState<string | null>(null);

  if (existing && !sectionsInitialized) {
    setDocType(existing.docType as DocType);
    setSections(existing.sections ?? emptySections(existing.docType as DocType));
    setSectionsInitialized(true);
  }

  const { data: categories } = useQuery({ queryKey: ["mobile-docs-categories"], queryFn: async () => (await axiosClient.get("/docs/categories")).data as string[] });
  const { data: collections } = useQuery({ queryKey: ["mobile-docs-collections"], queryFn: async () => (await axiosClient.get("/docs/collections")).data as Collection[] });
  const { data: users } = useQuery({ queryKey: ["mobile-users-directory"], queryFn: async () => (await axiosClient.get("/users/directory")).data as DirectoryUser[] });
  const { data: teams } = useQuery({ queryKey: ["mobile-teams-directory"], queryFn: async () => (await axiosClient.get("/teams/directory")).data as DirectoryTeam[] });

  const createCollectionMutation = useMutation({
    mutationFn: () => axiosClient.post("/docs/collections", { name: newCollectionName.trim() }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["mobile-docs-collections"] });
      setCollectionId(res.data.id);
      setNewCollectionName("");
      setShowNewCollection(false);
    },
  });

  function handleDocTypeChange(next: DocType) {
    setDocType(next);
    setSections(emptySections(next));
  }

  const categoryOptions: PickerOption[] = [...new Set([...DOC_CATEGORIES, ...(categories ?? [])])].map((c) => ({ id: c, label: c }));
  const collectionOptions: PickerOption[] = (collections ?? []).map((c) => ({ id: c.id, label: c.name }));
  const userOptions: PickerOption[] = (users ?? []).map((u) => ({ id: u.id, label: `${u.firstName} ${u.lastName}` }));
  const teamOptions: PickerOption[] = (teams ?? []).map((t) => ({ id: t.id, label: t.name }));

  const saveMutation = useMutation({
    mutationFn: (): Promise<{ data: any }> => {
      const payload = {
        title: title.trim(),
        category: category.trim(),
        collectionId,
        summary: summary.trim() || undefined,
        sections,
        tags: tagsText.split(",").map((t) => t.trim()).filter(Boolean),
        isPublished,
        reviewDueDate: reviewDueDate ? new Date(reviewDueDate).toISOString() : null,
      };
      return docId
        ? axiosClient.patch(`/docs/${docId}`, payload)
        : axiosClient.post("/docs", { ...payload, docType, access: pendingGrants });
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["mobile-docs"] });
      if (docId) {
        queryClient.invalidateQueries({ queryKey: ["mobile-document", docId] });
        navigation.goBack();
      } else {
        navigation.replace("DocumentDetail", { id: res.data.id });
      }
    },
    onError: (err: any) => setError(err?.response?.data?.error ?? "Could not save document."),
  });

  const canSave = title.trim().length > 0 && category.trim().length > 0 && collectionId != null;
  const labelStyle = { color: colors.textMuted, fontSize: 12, fontWeight: "700" as const, marginBottom: 8, textTransform: "uppercase" as const, marginTop: spacing.md };
  const inputStyle = { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: colors.text, backgroundColor: colors.surface };
  const pickerStyle = { ...inputStyle, flexDirection: "row" as const, justifyContent: "space-between" as const, alignItems: "center" as const };

  return (
    <KeyboardAvoidingScreen>
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: spacing.lg, paddingBottom: 60 }}>
      {error && (
        <View style={{ backgroundColor: colors.danger + "22", borderRadius: radius.md, padding: 12, marginBottom: spacing.md }}>
          <Text style={{ color: colors.danger, fontSize: 13 }}>{error}</Text>
        </View>
      )}

      <Text style={[labelStyle, { marginTop: 0 }]}>Document Type</Text>
      {docId ? (
        <Text style={{ color: colors.text, fontSize: 14, fontWeight: "600" }}>{DOC_TYPE_LABELS[docType]}</Text>
      ) : (
        <>
          <TouchableOpacity style={pickerStyle} onPress={() => setDocTypePickerOpen(true)}>
            <Text style={{ color: colors.text }}>{DOC_TYPE_LABELS[docType]}</Text>
            <Ionicons name="chevron-down" size={16} color={colors.textMuted} />
          </TouchableOpacity>
          <Text style={{ color: colors.textMuted, fontSize: 11.5, marginTop: 6 }}>{DOC_TYPE_DESCRIPTIONS[docType]}</Text>
        </>
      )}

      <Text style={labelStyle}>Title</Text>
      <TextInput style={inputStyle} placeholder="e.g. Hydraulic Lift Daily Startup" placeholderTextColor={colors.textMuted} value={title} onChangeText={setTitle} />

      <Text style={labelStyle}>Category</Text>
      <TouchableOpacity style={pickerStyle} onPress={() => setCategoryPickerOpen(true)}>
        <Text style={{ color: category ? colors.text : colors.textMuted }}>{category || "Select a category..."}</Text>
        <Ionicons name="chevron-down" size={16} color={colors.textMuted} />
      </TouchableOpacity>

      <Text style={labelStyle}>Collection</Text>
      <TouchableOpacity style={pickerStyle} onPress={() => setCollectionPickerOpen(true)}>
        <Text style={{ color: collectionId != null ? colors.text : colors.textMuted }}>{collectionOptions.find((c) => c.id === collectionId)?.label ?? "Select a collection..."}</Text>
        <Ionicons name="chevron-down" size={16} color={colors.textMuted} />
      </TouchableOpacity>
      {!showNewCollection ? (
        <TouchableOpacity onPress={() => setShowNewCollection(true)} style={{ marginTop: 8 }}>
          <Text style={{ color: colors.primary, fontSize: 12, fontWeight: "700" }}>+ New collection</Text>
        </TouchableOpacity>
      ) : (
        <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
          <TextInput style={[inputStyle, { flex: 1 }]} placeholder="Collection name" placeholderTextColor={colors.textMuted} value={newCollectionName} onChangeText={setNewCollectionName} />
          <TouchableOpacity
            style={{ backgroundColor: colors.primary, borderRadius: radius.md, paddingHorizontal: 14, justifyContent: "center", opacity: newCollectionName.trim() ? 1 : 0.5 }}
            disabled={!newCollectionName.trim() || createCollectionMutation.isPending}
            onPress={() => createCollectionMutation.mutate()}
          >
            <Text style={{ color: "#fff", fontWeight: "700", fontSize: 12 }}>Create</Text>
          </TouchableOpacity>
        </View>
      )}

      <Text style={labelStyle}>Summary (shown in search results)</Text>
      <TextInput style={inputStyle} placeholder="One-line description" placeholderTextColor={colors.textMuted} value={summary} onChangeText={setSummary} />

      <Text style={labelStyle}>Tags (comma-separated)</Text>
      <TextInput style={inputStyle} placeholder="e.g. lift, startup, safety" placeholderTextColor={colors.textMuted} value={tagsText} onChangeText={setTagsText} />

      <Text style={labelStyle}>Review Due Date (optional, YYYY-MM-DD)</Text>
      <TextInput style={inputStyle} placeholder="YYYY-MM-DD" placeholderTextColor={colors.textMuted} value={reviewDueDate} onChangeText={setReviewDueDate} />

      <TouchableOpacity style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: spacing.md }} onPress={() => setIsPublished((v) => !v)}>
        <Ionicons name={isPublished ? "checkbox" : "square-outline"} size={20} color={isPublished ? colors.primary : colors.textMuted} />
        <Text style={{ color: colors.text, fontSize: 12.5, flex: 1 }}>Published (visible to everyone with view access — uncheck to keep as a draft)</Text>
      </TouchableOpacity>

      <View style={{ height: 1, backgroundColor: colors.border, marginVertical: spacing.lg }} />

      <SectionsFormEditor fields={DOC_TYPE_FIELDS[docType]} sections={sections} onChange={(key, value) => setSections((s) => ({ ...s, [key]: value }))} />

      {!docId && (
        <>
          <View style={{ height: 1, backgroundColor: colors.border, marginVertical: spacing.lg }} />
          <Text style={[labelStyle, { marginTop: 0 }]}>Grant Access (optional)</Text>
          <Text style={{ color: colors.textMuted, fontSize: 11.5, marginBottom: 8 }}>Only you (the creator) can edit/delete this by default — grant others edit or delete access here.</Text>
          {pendingGrants.map((g, i) => (
            <View key={i} style={{ flexDirection: "row", alignItems: "center", backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.sm, marginBottom: 6 }}>
              <Text style={{ flex: 1, color: colors.text, fontSize: 12.5 }}>
                {g.userId != null ? userOptions.find((u) => u.id === g.userId)?.label : `Team: ${teamOptions.find((t) => t.id === g.teamId)?.label}`} — {LEVEL_LABELS[g.level]}
              </Text>
              <TouchableOpacity onPress={() => setPendingGrants((gs) => gs.filter((_, ii) => ii !== i))}>
                <Ionicons name="close" size={16} color={colors.danger} />
              </TouchableOpacity>
            </View>
          ))}
          <View style={{ flexDirection: "row", gap: 8 }}>
            {(["EDIT", "DELETE"] as AccessLevel[]).map((lvl) => (
              <TouchableOpacity
                key={lvl}
                style={{ borderWidth: 1, borderColor: grantLevel === lvl ? colors.primary : colors.border, backgroundColor: grantLevel === lvl ? colors.primary + "22" : colors.surface, borderRadius: radius.md, paddingHorizontal: 10, paddingVertical: 12 }}
                onPress={() => setGrantLevel(lvl)}
              >
                <Text style={{ color: grantLevel === lvl ? colors.primary : colors.text, fontSize: 11.5, fontWeight: "700" }}>{LEVEL_LABELS[lvl]}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={[pickerStyle, { flex: 1 }]} onPress={() => setGrantPickerOpen(true)}>
              <Text style={{ color: colors.textMuted }}>Add person or team...</Text>
              <Ionicons name="chevron-down" size={16} color={colors.textMuted} />
            </TouchableOpacity>
          </View>
        </>
      )}

      <TouchableOpacity
        style={{ backgroundColor: colors.primary, borderRadius: radius.md, alignItems: "center", paddingVertical: 15, marginTop: spacing.lg, opacity: canSave ? 1 : 0.6 }}
        disabled={!canSave || saveMutation.isPending}
        onPress={() => saveMutation.mutate()}
      >
        {saveMutation.isPending ? <ActivityIndicator color="#fff" /> : <Text style={{ color: "#fff", fontWeight: "700" }}>{docId ? "Save Changes" : "Create Document"}</Text>}
      </TouchableOpacity>

      <PickerModal visible={docTypePickerOpen} title="Document Type" options={DOC_TYPES.map((t) => ({ id: t, label: DOC_TYPE_LABELS[t] }))} selectedId={docType} onSelect={(v) => handleDocTypeChange(v as DocType)} onClose={() => setDocTypePickerOpen(false)} />
      <PickerModal visible={categoryPickerOpen} title="Category" options={categoryOptions} searchable selectedId={category} onSelect={(v) => setCategory(String(v ?? ""))} onClose={() => setCategoryPickerOpen(false)} />
      <PickerModal visible={collectionPickerOpen} title="Collection" options={collectionOptions} searchable selectedId={collectionId} onSelect={(v) => setCollectionId(v == null ? null : Number(v))} onClose={() => setCollectionPickerOpen(false)} />
      <PickerModal
        visible={grantPickerOpen}
        title="Grant access to"
        options={[...userOptions.map((o) => ({ ...o, id: `u-${o.id}` })), ...teamOptions.map((o) => ({ ...o, id: `t-${o.id}`, label: `${o.label} (team)` }))]}
        searchable
        onSelect={(v) => {
          if (v == null) return;
          const id = String(v);
          if (id.startsWith("u-")) setPendingGrants((gs) => [...gs, { userId: Number(id.slice(2)), level: grantLevel }]);
          else setPendingGrants((gs) => [...gs, { teamId: Number(id.slice(2)), level: grantLevel }]);
        }}
        onClose={() => setGrantPickerOpen(false)}
      />
    </ScrollView>
    </KeyboardAvoidingScreen>
  );
}
