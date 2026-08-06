import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, FlatList, Linking, RefreshControl, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import dayjs from "dayjs";
import { axiosClient } from "../../api/axiosClient";
import { useTheme } from "../../theme/ThemeContext";
import { ShimmerListItem } from "../../components/Shimmer";

interface RssSource {
  id: number;
  name: string;
  url: string;
}
interface FeedItem {
  title: string;
  link: string | null;
  pubDate: string | null;
  sourceName: string;
}

export function RssFeedScreen() {
  const { colors, spacing, radius } = useTheme();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");

  const { data: sources } = useQuery({
    queryKey: ["mobile-rss-sources"],
    queryFn: async () => (await axiosClient.get("/operations/rss/sources")).data as RssSource[],
  });

  const { data: feed, isLoading, isRefetching, refetch } = useQuery({
    queryKey: ["mobile-rss-items"],
    queryFn: async () => (await axiosClient.get("/operations/rss/items")).data as { items: FeedItem[]; failedSources: string[] },
    enabled: Boolean(sources && sources.length > 0),
  });

  const addMutation = useMutation({
    mutationFn: () => axiosClient.post("/operations/rss/sources", { name, url }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mobile-rss-sources"] });
      setName("");
      setUrl("");
    },
  });

  const removeMutation = useMutation({
    mutationFn: (id: number) => axiosClient.delete(`/operations/rss/sources/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mobile-rss-sources"] });
      queryClient.invalidateQueries({ queryKey: ["mobile-rss-items"] });
    },
  });

  function confirmRemove(source: RssSource) {
    Alert.alert("Remove feed source", `Remove "${source.name}"? This cannot be undone.`, [
      { text: "Cancel", style: "cancel" },
      { text: "Remove", style: "destructive", onPress: () => removeMutation.mutate(source.id) },
    ]);
  }

  const inputStyle = {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 13,
    color: colors.text,
    backgroundColor: colors.surface,
  };

  return (
    <FlatList
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm }}
      refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.primary} />}
      ListHeaderComponent={
        <View style={{ gap: spacing.md, marginBottom: spacing.md }}>
          <View style={{ backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, gap: 8 }}>
            <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: "700", textTransform: "uppercase" }}>Add Feed Source</Text>
            <TextInput style={inputStyle} placeholder="Name (e.g. Industry News)" placeholderTextColor={colors.textMuted} value={name} onChangeText={setName} />
            <TextInput style={inputStyle} placeholder="https://example.com/feed.xml" placeholderTextColor={colors.textMuted} autoCapitalize="none" value={url} onChangeText={setUrl} />
            <TouchableOpacity
              style={{ backgroundColor: colors.primary, borderRadius: radius.md, alignItems: "center", paddingVertical: 10, opacity: name && url ? 1 : 0.5 }}
              disabled={!name || !url || addMutation.isPending}
              onPress={() => addMutation.mutate()}
            >
              <Text style={{ color: "#fff", fontWeight: "700", fontSize: 13 }}>{addMutation.isPending ? "Adding..." : "Add Source"}</Text>
            </TouchableOpacity>
          </View>

          {sources && sources.length > 0 && (
            <View style={{ gap: 6 }}>
              {sources.map((s) => (
                <View key={s.id} style={{ flexDirection: "row", alignItems: "center", backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.text, fontSize: 13, fontWeight: "600" }}>{s.name}</Text>
                    <Text style={{ color: colors.textMuted, fontSize: 11 }} numberOfLines={1}>{s.url}</Text>
                  </View>
                  <TouchableOpacity onPress={() => confirmRemove(s)} style={{ padding: 6 }}>
                    <Ionicons name="trash-outline" size={18} color={colors.danger} />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}

          <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: "700", textTransform: "uppercase", marginTop: 4 }}>Latest Headlines</Text>
          {isLoading && (
            <View style={{ gap: spacing.sm, marginTop: 8 }}>
              <ShimmerListItem />
              <ShimmerListItem />
              <ShimmerListItem />
            </View>
          )}
          {feed && feed.failedSources.length > 0 && (
            <Text style={{ color: colors.warning, fontSize: 11 }}>Could not fetch: {feed.failedSources.join(", ")}</Text>
          )}
        </View>
      }
      data={feed?.items ?? []}
      keyExtractor={(item, i) => `${item.link ?? item.title}-${i}`}
      ListEmptyComponent={
        !isLoading ? (
          <Text style={{ color: colors.textMuted, textAlign: "center", marginTop: 12 }}>
            {sources?.length ? "No headlines returned yet." : "Add a feed source to see live headlines here."}
          </Text>
        ) : null
      }
      renderItem={({ item }) => (
        <TouchableOpacity
          style={{ backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, marginBottom: 6 }}
          disabled={!item.link}
          onPress={() => item.link && Linking.openURL(item.link)}
        >
          <Text style={{ color: colors.text, fontSize: 13, fontWeight: "600" }}>{item.title}</Text>
          <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 3 }}>
            {item.sourceName}{item.pubDate ? ` · ${dayjs(item.pubDate).format("DD MMM YYYY, HH:mm")}` : ""}
          </Text>
        </TouchableOpacity>
      )}
    />
  );
}
