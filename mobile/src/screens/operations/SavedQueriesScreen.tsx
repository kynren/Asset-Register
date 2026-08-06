import { Fragment, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Alert, FlatList, RefreshControl, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import dayjs from "dayjs";
import { axiosClient } from "../../api/axiosClient";
import { useTheme } from "../../theme/ThemeContext";
import { PickerModal, PickerOption } from "../../components/PickerModal";
import { ShimmerList } from "../../components/Shimmer";
import { MainTabParamList } from "../../navigation/types";

interface SavedQuery {
  id: number;
  label: string;
  module: string;
  queryString: string;
  createdAt: string;
}

// Mirrors client/src/pages/operations/tabs/SavedQueriesTab.tsx's MODULES list. "Apply" here just
// jumps to that module's mobile tab root — mobile list screens don't parse the web app's arbitrary
// querystring filters, so the saved filter itself isn't re-applied, only the destination.
const MODULES: { value: string; label: string; tab: keyof MainTabParamList }[] = [
  { value: "assets", label: "Asset Inventory", tab: "AssetsTab" },
  { value: "tickets", label: "Helpdesk & Ticketing", tab: "HelpdeskTab" },
  { value: "stock", label: "Stock Register", tab: "StockTab" },
];

export function SavedQueriesScreen() {
  const { colors, spacing, radius } = useTheme();
  const queryClient = useQueryClient();
  const navigation = useNavigation<NativeStackNavigationProp<any>>();
  const [label, setLabel] = useState("");
  const [module, setModule] = useState("assets");
  const [modulePickerOpen, setModulePickerOpen] = useState(false);
  const [queryString, setQueryString] = useState("");

  const { data: queries, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ["mobile-saved-queries"],
    queryFn: async () => (await axiosClient.get("/operations/saved-queries")).data as SavedQuery[],
  });

  const createMutation = useMutation({
    mutationFn: () => axiosClient.post("/operations/saved-queries", { label, module, queryString }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mobile-saved-queries"] });
      setLabel("");
      setQueryString("");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => axiosClient.delete(`/operations/saved-queries/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["mobile-saved-queries"] }),
  });

  function confirmDelete(q: SavedQuery) {
    Alert.alert("Delete saved query", `Delete "${q.label}"? This cannot be undone.`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => deleteMutation.mutate(q.id) },
    ]);
  }

  function apply(q: SavedQuery) {
    const target = MODULES.find((m) => m.value === q.module);
    if (target) navigation.getParent()?.navigate(target.tab);
  }

  const moduleOptions: PickerOption[] = MODULES.map((m) => ({ id: m.value, label: m.label }));
  const inputStyle = { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 10, fontSize: 13, color: colors.text, backgroundColor: colors.surface };

  if (isLoading) return <ShimmerList />;

  return (
    <Fragment>
    <FlatList
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm }}
      refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.primary} />}
      ListHeaderComponent={
        <View style={{ backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, gap: 8, marginBottom: spacing.md }}>
          <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: "700", textTransform: "uppercase" }}>Save a Query</Text>
          <TextInput style={inputStyle} placeholder="Label (e.g. Overdue Repairs)" placeholderTextColor={colors.textMuted} value={label} onChangeText={setLabel} />
          <TouchableOpacity style={[inputStyle, { flexDirection: "row", justifyContent: "space-between", alignItems: "center" }]} onPress={() => setModulePickerOpen(true)}>
            <Text style={{ color: colors.text }}>{MODULES.find((m) => m.value === module)?.label}</Text>
            <Ionicons name="chevron-down" size={16} color={colors.textMuted} />
          </TouchableOpacity>
          <TextInput style={inputStyle} placeholder="e.g. status=IN_REPAIR&search=laptop" placeholderTextColor={colors.textMuted} autoCapitalize="none" value={queryString} onChangeText={setQueryString} />
          <TouchableOpacity
            style={{ backgroundColor: colors.primary, borderRadius: radius.md, alignItems: "center", paddingVertical: 10, opacity: label && queryString ? 1 : 0.5 }}
            disabled={!label || !queryString || createMutation.isPending}
            onPress={() => createMutation.mutate()}
          >
            <Text style={{ color: "#fff", fontWeight: "700", fontSize: 13 }}>{createMutation.isPending ? "Saving..." : "Save Query"}</Text>
          </TouchableOpacity>
        </View>
      }
      data={queries ?? []}
      keyExtractor={(item) => String(item.id)}
      ListEmptyComponent={!isLoading ? <Text style={{ color: colors.textMuted, textAlign: "center", marginTop: 12 }}>No saved queries yet.</Text> : null}
      renderItem={({ item }) => (
        <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, marginBottom: 6 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.text, fontSize: 13, fontWeight: "700" }}>{item.label}</Text>
            <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 2 }} numberOfLines={1}>
              {MODULES.find((m) => m.value === item.module)?.label ?? item.module} · Saved {dayjs(item.createdAt).format("DD MMM YYYY")}
            </Text>
          </View>
          <TouchableOpacity onPress={() => apply(item)} style={{ padding: 6 }}>
            <Ionicons name="arrow-forward-circle-outline" size={20} color={colors.primary} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => confirmDelete(item)} style={{ padding: 6 }}>
            <Ionicons name="trash-outline" size={18} color={colors.danger} />
          </TouchableOpacity>
        </View>
      )}
    />
    <PickerModal visible={modulePickerOpen} title="Select module" options={moduleOptions} selectedId={module} onSelect={(v) => setModule(v as string)} onClose={() => setModulePickerOpen(false)} />
    </Fragment>
  );
}
