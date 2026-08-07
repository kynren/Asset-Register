import { Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import dayjs from "dayjs";
import { useTheme } from "../theme/ThemeContext";
import { DOC_TYPE_COLORS, DOC_TYPE_ICONS, DOC_TYPE_LABELS, DocType } from "../lib/docsConstants";

export interface DocBookCardItem {
  id: number;
  title: string;
  docType: DocType;
  category: string | null;
  collection: { id: number; name: string } | null;
  summary: string | null;
  isPublished: boolean;
  reviewDueDate: string | null;
  updatedAt: string;
}

interface DocBookCardProps {
  doc: DocBookCardItem;
  onPress: () => void;
  onCollectionPress?: (collection: { id: number; name: string }) => void;
  width?: number;
}

// Mirrors client/src/pages/docs/DocBookCard.tsx's "book cover" look — a color/icon per doc type so
// the library shelves read as distinct genres at a glance. Web's card is a hover-flip; mobile has
// no hover, so this renders front+back content stacked in one tappable card instead.
export function DocBookCard({ doc, onPress, onCollectionPress, width = 170 }: DocBookCardProps) {
  const { colors, spacing, radius } = useTheme();
  const cover = DOC_TYPE_COLORS[doc.docType];
  const overdue = doc.reviewDueDate ? dayjs(doc.reviewDueDate).isBefore(dayjs()) : false;

  return (
    <TouchableOpacity
      style={{ width, borderRadius: radius.md, overflow: "hidden", backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}
      onPress={onPress}
      activeOpacity={0.8}
    >
      <View style={{ backgroundColor: cover.from, padding: spacing.md, minHeight: 92, justifyContent: "space-between" }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
          <Ionicons name={DOC_TYPE_ICONS[doc.docType]} size={22} color="#fff" />
          {!doc.isPublished && (
            <View style={{ backgroundColor: "rgba(0,0,0,0.35)", borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 }}>
              <Text style={{ color: "#fff", fontSize: 9.5, fontWeight: "800" }}>DRAFT</Text>
            </View>
          )}
        </View>
        <Text style={{ color: "#fff", fontSize: 13, fontWeight: "800" }} numberOfLines={2}>{doc.title}</Text>
      </View>

      <View style={{ padding: spacing.md }}>
        <Text style={{ color: colors.textMuted, fontSize: 10.5, fontWeight: "700", textTransform: "uppercase" }} numberOfLines={1}>
          {DOC_TYPE_LABELS[doc.docType]}
        </Text>
        {doc.collection ? (
          <TouchableOpacity onPress={() => onCollectionPress?.(doc.collection!)} hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}>
            <Text style={{ color: colors.primary, fontSize: 11.5, fontWeight: "700", marginTop: 3 }} numberOfLines={1}>{doc.collection.name}</Text>
          </TouchableOpacity>
        ) : doc.category ? (
          <Text style={{ color: colors.textMuted, fontSize: 11.5, marginTop: 3 }} numberOfLines={1}>{doc.category}</Text>
        ) : null}
        {doc.summary && (
          <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 4 }} numberOfLines={2}>{doc.summary}</Text>
        )}
        <Text style={{ color: overdue ? colors.danger : colors.textMuted, fontSize: 10.5, fontWeight: overdue ? "700" : "400", marginTop: 6 }}>
          {doc.reviewDueDate ? `Review ${overdue ? "overdue" : "due"} ${dayjs(doc.reviewDueDate).format("DD MMM YYYY")}` : `Updated ${dayjs(doc.updatedAt).format("DD MMM YYYY")}`}
        </Text>
      </View>
    </TouchableOpacity>
  );
}
