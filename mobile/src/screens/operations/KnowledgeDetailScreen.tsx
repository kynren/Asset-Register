import { useLayoutEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import { Text, View } from "react-native";
import { WebView } from "react-native-webview";
import dayjs from "dayjs";
import { axiosClient } from "../../api/axiosClient";
import { useTheme } from "../../theme/ThemeContext";
import { ShimmerDetail } from "../../components/Shimmer";
import { KnowledgeArticle } from "../../types/operations";
import { MoreStackParamList } from "../../navigation/types";

export function KnowledgeDetailScreen() {
  const { colors, spacing } = useTheme();
  const navigation = useNavigation();
  const route = useRoute<RouteProp<MoreStackParamList, "KnowledgeDetail">>();
  const { id } = route.params;

  const { data: articles, isLoading } = useQuery({
    queryKey: ["mobile-knowledge-all"],
    queryFn: async () => (await axiosClient.get("/operations/knowledge")).data as KnowledgeArticle[],
  });
  const article = articles?.find((a) => a.id === id);

  useLayoutEffect(() => {
    navigation.setOptions({ title: article?.title ?? "Article" });
  }, [navigation, article]);

  if (isLoading || !article) {
    return <ShimmerDetail />;
  }

  // The article body is stored as sanitized rich-text HTML (see server's KnowledgeArticle.content,
  // written via the same TipTap editor used for Docs & SOPs) — a WebView is the simplest way to
  // render arbitrary HTML on RN without re-implementing a rich-text renderer.
  const html = `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>
    body { font-family: -apple-system, Roboto, sans-serif; color: ${colors.text}; background: ${colors.bg}; padding: 16px; font-size: 15px; line-height: 1.55; }
    img { max-width: 100%; height: auto; border-radius: 8px; }
    a { color: ${colors.primary}; }
    h1, h2, h3 { color: ${colors.text}; }
  </style></head><body>${article.content}</body></html>`;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ padding: spacing.lg, paddingBottom: spacing.sm }}>
        <Text style={{ color: colors.textMuted, fontSize: 12 }}>
          {article.category ? `${article.category} · ` : ""}
          {article.createdBy.firstName} {article.createdBy.lastName} · Updated {dayjs(article.updatedAt).format("DD MMM YYYY")}
        </Text>
      </View>
      <WebView source={{ html }} style={{ flex: 1, backgroundColor: colors.bg }} originWhitelist={["*"]} />
    </View>
  );
}
