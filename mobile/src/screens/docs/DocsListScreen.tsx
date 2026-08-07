import { useMemo, useState } from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { ActivityIndicator, FlatList, RefreshControl, ScrollView, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import dayjs, { Dayjs } from "dayjs";
import { axiosClient } from "../../api/axiosClient";
import { useTheme } from "../../theme/ThemeContext";
import { useAuth } from "../../auth/AuthContext";
import { DocBookCard, DocBookCardItem } from "../../components/DocBookCard";
import { CategoryTab, CategoryTabBar } from "../../components/CategoryTabBar";
import { PickerModal, PickerOption } from "../../components/PickerModal";
import { DOC_CATEGORIES, DOC_TYPES, DOC_TYPE_LABELS, DocType } from "../../lib/docsConstants";
import { DOC_TYPE_LABELS as SHORT_DOC_TYPE_LABELS, DocumentSummary } from "../../types/docs";
import { PaginatedResponse } from "../../types/asset";
import { MoreStackParamList } from "../../navigation/types";

const PAGE_SIZE = 25;

type RecentPresetId = "48h" | "7d" | "30d" | "month";
const RECENT_PRESETS: { id: RecentPresetId; label: string; hours?: number }[] = [
  { id: "48h", label: "48 Hours" },
  { id: "7d", label: "7 Days" },
  { id: "30d", label: "30 Days" },
  { id: "month", label: "This Month" },
];
function computeRecentRange(preset: RecentPresetId): { from: Dayjs; label: string } {
  if (preset === "month") return { from: dayjs().startOf("month"), label: "This Month" };
  const hours = preset === "48h" ? 48 : preset === "7d" ? 24 * 7 : 24 * 30;
  return { from: dayjs().subtract(hours, "hour"), label: RECENT_PRESETS.find((p) => p.id === preset)!.label };
}

interface CollectionRef {
  id: number;
  name: string;
}

export function DocsListScreen() {
  const { colors, spacing, radius } = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<MoreStackParamList>>();
  const { hasPermission } = useAuth();
  const [search, setSearch] = useState("");
  const [docType, setDocType] = useState<DocType | "">("");
  const [docTypePickerOpen, setDocTypePickerOpen] = useState(false);
  const [view, setView] = useState<"library" | "list">("library");
  const [recentPreset, setRecentPreset] = useState<RecentPresetId>("48h");
  const [activeCategory, setActiveCategory] = useState("");
  const [activeCollection, setActiveCollection] = useState<CollectionRef | null>(null);

  const hasActiveFilter = Boolean(search.trim() || docType);

  const { data: library, isLoading: libraryLoading } = useQuery({
    queryKey: ["mobile-docs-library"],
    queryFn: async () => (await axiosClient.get("/docs/library")).data as DocumentSummary[],
    enabled: view === "library",
  });

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading, refetch, isRefetching } = useInfiniteQuery({
    queryKey: ["mobile-docs", search, docType],
    queryFn: async ({ pageParam }) => {
      const res = await axiosClient.get("/docs", { params: { page: pageParam, pageSize: PAGE_SIZE, search: search || undefined, docType: docType || undefined } });
      return res.data as PaginatedResponse<DocumentSummary>;
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage) => (lastPage.page < lastPage.totalPages ? lastPage.page + 1 : undefined),
    enabled: view === "list" || hasActiveFilter,
  });
  const filteredItems = data?.pages.flatMap((p) => p.items) ?? [];

  const recentRange = useMemo(() => computeRecentRange(recentPreset), [recentPreset]);
  const recentlyUpdated = useMemo(() => {
    if (!library) return [];
    return library.filter((d) => !dayjs(d.updatedAt).isBefore(recentRange.from)).sort((a, b) => dayjs(b.updatedAt).diff(dayjs(a.updatedAt)));
  }, [library, recentRange]);
  const reviewDueSoon = useMemo(() => {
    if (!library) return [];
    const now = dayjs();
    return library.filter((d) => d.reviewDueDate && dayjs(d.reviewDueDate).diff(now, "day") <= 30).sort((a, b) => dayjs(a.reviewDueDate!).diff(dayjs(b.reviewDueDate!)));
  }, [library]);
  const categoryTabs = useMemo<CategoryTab[]>(() => {
    if (!library) return [];
    const counts = new Map<string, number>();
    for (const doc of library) counts.set(doc.category ?? "General", (counts.get(doc.category ?? "General") ?? 0) + 1);
    const known = DOC_CATEGORIES.filter((c) => counts.has(c));
    const extra = [...counts.keys()].filter((c) => !DOC_CATEGORIES.includes(c)).sort((a, b) => a.localeCompare(b));
    return [...known, ...extra].map((name) => ({ name, count: counts.get(name)! }));
  }, [library]);
  const categoryDocs = useMemo(() => {
    if (!library) return [];
    let docs = library;
    if (activeCollection) docs = docs.filter((d) => d.collection?.id === activeCollection.id);
    else if (activeCategory) docs = docs.filter((d) => (d.category ?? "General") === activeCategory);
    return [...docs].sort((a, b) => dayjs(b.updatedAt).diff(dayjs(a.updatedAt)));
  }, [library, activeCategory, activeCollection]);

  function selectCollection(collection: CollectionRef) {
    setActiveCategory("");
    setActiveCollection(collection);
  }
  function selectCategory(category: string) {
    setActiveCollection(null);
    setActiveCategory(category);
  }

  const docTypeOptions: PickerOption[] = DOC_TYPES.map((t) => ({ id: t, label: DOC_TYPE_LABELS[t] }));

  const header = (
    <View style={{ padding: spacing.lg, paddingBottom: spacing.sm, gap: spacing.sm }}>
      <View style={{ flexDirection: "row", gap: 8 }}>
        <View style={{ flex: 1, flexDirection: "row", alignItems: "center", backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.md, borderWidth: 1, paddingHorizontal: 12, height: 42 }}>
          <Ionicons name="search" size={16} color={colors.textMuted} />
          <TextInput
            style={{ flex: 1, marginLeft: 8, color: colors.text }}
            placeholder="Search docs & SOPs..."
            placeholderTextColor={colors.textMuted}
            value={search}
            onChangeText={setSearch}
          />
        </View>
        {hasPermission("docs", "import") && (
          <TouchableOpacity style={{ width: 42, height: 42, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" }} onPress={() => navigation.navigate("ImportDocs")}>
            <Ionicons name="cloud-upload-outline" size={18} color={colors.text} />
          </TouchableOpacity>
        )}
      </View>

      <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
        <TouchableOpacity
          style={{ flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1, borderColor: docType ? colors.primary : colors.border, backgroundColor: docType ? colors.primary + "22" : colors.surface, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 8 }}
          onPress={() => setDocTypePickerOpen(true)}
        >
          <Text style={{ color: docType ? colors.primary : colors.text, fontSize: 12.5, fontWeight: "700" }}>{docType ? DOC_TYPE_LABELS[docType] : "All Types"}</Text>
          <Ionicons name="chevron-down" size={13} color={docType ? colors.primary : colors.textMuted} />
        </TouchableOpacity>
        <View style={{ flex: 1 }} />
        <View style={{ flexDirection: "row", borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, overflow: "hidden" }}>
          <TouchableOpacity style={{ paddingHorizontal: 12, paddingVertical: 8, backgroundColor: view === "library" ? colors.primary : colors.surface }} onPress={() => setView("library")}>
            <Ionicons name="book-outline" size={15} color={view === "library" ? "#fff" : colors.textMuted} />
          </TouchableOpacity>
          <TouchableOpacity style={{ paddingHorizontal: 12, paddingVertical: 8, backgroundColor: view === "list" ? colors.primary : colors.surface }} onPress={() => setView("list")}>
            <Ionicons name="list-outline" size={15} color={view === "list" ? "#fff" : colors.textMuted} />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );

  const showLibraryShelves = view === "library" && !hasActiveFilter;
  const showFilteredGrid = view === "library" && hasActiveFilter;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      {view === "list" || showFilteredGrid ? (
        <FlatList
          data={filteredItems}
          keyExtractor={(item) => String(item.id)}
          numColumns={showFilteredGrid ? 2 : 1}
          key={showFilteredGrid ? "grid" : "list"}
          columnWrapperStyle={showFilteredGrid ? { gap: spacing.sm, paddingHorizontal: spacing.lg, justifyContent: "center" } : undefined}
          contentContainerStyle={{ padding: spacing.lg, paddingTop: 0, gap: spacing.sm }}
          ListHeaderComponent={header}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.primary} />}
          onEndReachedThreshold={0.4}
          onEndReached={() => hasNextPage && fetchNextPage()}
          ListFooterComponent={isFetchingNextPage ? <ActivityIndicator style={{ marginVertical: 16 }} color={colors.primary} /> : null}
          ListEmptyComponent={!isLoading ? <Text style={{ color: colors.textMuted, textAlign: "center", marginTop: 40 }}>{search ? `No documents match "${search}".` : "No documents found."}</Text> : null}
          renderItem={({ item }) =>
            showFilteredGrid ? (
              <View style={{ marginBottom: spacing.sm }}>
                <DocBookCard doc={item} onPress={() => navigation.navigate("DocumentDetail", { id: item.id })} />
              </View>
            ) : (
              <TouchableOpacity
                style={{ backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md }}
                onPress={() => navigation.navigate("DocumentDetail", { id: item.id })}
              >
                <Text style={{ color: colors.text, fontSize: 14, fontWeight: "700" }}>{item.title}</Text>
                <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }}>
                  {SHORT_DOC_TYPE_LABELS[item.docType]}
                  {item.category ? ` · ${item.category}` : ""} · Updated {dayjs(item.updatedAt).format("DD MMM YYYY")}
                </Text>
                {item.summary && (
                  <Text style={{ color: colors.textMuted, fontSize: 12.5, marginTop: 4 }} numberOfLines={2}>
                    {item.summary}
                  </Text>
                )}
              </TouchableOpacity>
            )
          }
        />
      ) : libraryLoading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: spacing.xl }}>
          {header}

          {!library || library.length === 0 ? (
            <View style={{ alignItems: "center", padding: spacing.xl }}>
              <Ionicons name="book-outline" size={32} color={colors.textMuted} />
              <Text style={{ color: colors.textMuted, marginTop: 10, textAlign: "center" }}>The library is empty — add the first document to start building the collection.</Text>
            </View>
          ) : (
            <>
              <View style={{ paddingHorizontal: spacing.lg, marginBottom: spacing.lg }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <Text style={{ color: colors.text, fontSize: 15, fontWeight: "800" }}>Recently Updated</Text>
                  <Text style={{ color: colors.textMuted, fontSize: 12 }}>{recentlyUpdated.length}</Text>
                </View>
                <View style={{ flexDirection: "row", gap: 6, marginBottom: 10 }}>
                  {RECENT_PRESETS.map((p) => (
                    <TouchableOpacity
                      key={p.id}
                      style={{ borderWidth: 1, borderColor: recentPreset === p.id ? colors.primary : colors.border, backgroundColor: recentPreset === p.id ? colors.primary + "22" : colors.surface, borderRadius: radius.sm, paddingHorizontal: 9, paddingVertical: 5 }}
                      onPress={() => setRecentPreset(p.id)}
                    >
                      <Text style={{ color: recentPreset === p.id ? colors.primary : colors.text, fontSize: 11, fontWeight: "700" }}>{p.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                {recentlyUpdated.length === 0 ? (
                  <Text style={{ color: colors.textMuted, fontSize: 12.5 }}>No documents updated in this range.</Text>
                ) : (
                  <FlatList
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    data={recentlyUpdated}
                    keyExtractor={(d) => String(d.id)}
                    contentContainerStyle={{ gap: spacing.sm }}
                    renderItem={({ item }) => (
                      <DocBookCard doc={item} onPress={() => navigation.navigate("DocumentDetail", { id: item.id })} onCollectionPress={selectCollection} />
                    )}
                  />
                )}
              </View>

              {reviewDueSoon.length > 0 && (
                <View style={{ paddingHorizontal: spacing.lg, marginBottom: spacing.lg }}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                    <Text style={{ color: colors.text, fontSize: 15, fontWeight: "800" }}>Review Due Soon</Text>
                    <Text style={{ color: colors.textMuted, fontSize: 12 }}>{reviewDueSoon.length}</Text>
                  </View>
                  <FlatList
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    data={reviewDueSoon}
                    keyExtractor={(d) => String(d.id)}
                    contentContainerStyle={{ gap: spacing.sm }}
                    renderItem={({ item }) => (
                      <DocBookCard doc={item} onPress={() => navigation.navigate("DocumentDetail", { id: item.id })} onCollectionPress={selectCollection} />
                    )}
                  />
                </View>
              )}

              <View style={{ paddingHorizontal: spacing.lg }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 8 }}>
                  {activeCollection ? (
                    <>
                      <TouchableOpacity onPress={() => setActiveCollection(null)}>
                        <Text style={{ color: colors.primary, fontSize: 13, fontWeight: "700" }}>Categories</Text>
                      </TouchableOpacity>
                      <Ionicons name="chevron-forward" size={12} color={colors.textMuted} />
                      <Text style={{ color: colors.text, fontSize: 15, fontWeight: "800" }}>{activeCollection.name}</Text>
                    </>
                  ) : (
                    <Text style={{ color: colors.text, fontSize: 15, fontWeight: "800" }}>Categories</Text>
                  )}
                </View>
                {!activeCollection && <CategoryTabBar categories={categoryTabs} active={activeCategory} onSelect={selectCategory} />}
                {categoryDocs.length === 0 ? (
                  <Text style={{ color: colors.textMuted, fontSize: 12.5, marginTop: 12 }}>No documents in this {activeCollection ? "collection" : "category"} yet.</Text>
                ) : (
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: 12, justifyContent: "center" }}>
                    {categoryDocs.map((doc) => (
                      <DocBookCard key={doc.id} doc={doc} onPress={() => navigation.navigate("DocumentDetail", { id: doc.id })} onCollectionPress={selectCollection} />
                    ))}
                  </View>
                )}
              </View>
            </>
          )}
        </ScrollView>
      )}

      {hasPermission("docs", "create") && (
        <TouchableOpacity
          style={{ position: "absolute", right: spacing.lg, bottom: spacing.lg, backgroundColor: colors.primary, borderRadius: 28, width: 56, height: 56, alignItems: "center", justifyContent: "center", elevation: 4 }}
          onPress={() => navigation.navigate("DocumentForm", undefined)}
        >
          <Ionicons name="add" size={26} color="#fff" />
        </TouchableOpacity>
      )}

      <PickerModal
        visible={docTypePickerOpen}
        title="Document Type"
        options={docTypeOptions}
        selectedId={docType || null}
        onSelect={(v) => setDocType((v as DocType) ?? "")}
        onClose={() => setDocTypePickerOpen(false)}
      />
    </View>
  );
}
