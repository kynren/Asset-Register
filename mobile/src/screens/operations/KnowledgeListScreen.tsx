import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { FlatList, RefreshControl, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import dayjs from "dayjs";
import { axiosClient } from "../../api/axiosClient";
import { useTheme } from "../../theme/ThemeContext";
import { ShimmerList } from "../../components/Shimmer";
import { KnowledgeArticle } from "../../types/operations";
import { MoreStackParamList } from "../../navigation/types";

// Read-focused, same philosophy as the Docs & SOPs module — the web app's article editor (rich
// text, access grants) is desk-work, but searching a colleague's writeup on-site is exactly what a
// phone is good for.
export function KnowledgeListScreen() {
  const { colors, spacing, radius } = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<MoreStackParamList>>();
  const [search, setSearch] = useState("");

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ["mobile-knowledge", search],
    queryFn: async () => (await axiosClient.get("/operations/knowledge", { params: { search: search || undefined } })).data as KnowledgeArticle[],
  });

  const articles = data ?? [];

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ padding: spacing.lg, paddingBottom: spacing.sm }}>
        <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.md, borderWidth: 1, paddingHorizontal: 12, height: 42 }}>
          <Ionicons name="search" size={16} color={colors.textMuted} />
          <TextInput
            style={{ flex: 1, marginLeft: 8, color: colors.text }}
            placeholder="Search articles..."
            placeholderTextColor={colors.textMuted}
            value={search}
            onChangeText={setSearch}
          />
        </View>
      </View>

      {isLoading ? (
        <ShimmerList />
      ) : (
        <FlatList
          data={articles}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={{ padding: spacing.lg, paddingTop: 0, gap: spacing.sm }}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.primary} />}
          ListEmptyComponent={<Text style={{ color: colors.textMuted, textAlign: "center", marginTop: 40 }}>No articles found.</Text>}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={{ backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md }}
              onPress={() => navigation.navigate("KnowledgeDetail", { id: item.id })}
            >
              <Text style={{ color: colors.text, fontSize: 14, fontWeight: "700" }}>{item.title}</Text>
              <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }}>
                {item.category ? `${item.category} · ` : ""}Updated {dayjs(item.updatedAt).format("DD MMM YYYY")}
              </Text>
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  );
}
