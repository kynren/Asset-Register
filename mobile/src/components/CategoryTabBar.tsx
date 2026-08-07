import { ScrollView, Text, TouchableOpacity } from "react-native";
import { useTheme } from "../theme/ThemeContext";

export interface CategoryTab {
  name: string;
  count: number;
}

interface CategoryTabBarProps {
  categories: CategoryTab[];
  active: string;
  onSelect: (category: string) => void;
  allCount?: number;
}

// Mirrors client/src/pages/docs/CategoryTabBar.tsx's category chip row. Web measures available
// width and collapses overflow into a "More" popover; mobile has no fixed-width row to overflow —
// a horizontal ScrollView is the native equivalent, so every category stays reachable by swiping.
export function CategoryTabBar({ categories, active, onSelect, allCount }: CategoryTabBarProps) {
  const { colors, spacing, radius } = useTheme();
  const allTabs: CategoryTab[] = [{ name: "", count: allCount ?? categories.reduce((sum, c) => sum + c.count, 0) }, ...categories];

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 4 }}>
      {allTabs.map((tab) => {
        const isActive = active === tab.name;
        return (
          <TouchableOpacity
            key={tab.name || "all"}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 6,
              borderWidth: 1,
              borderColor: isActive ? colors.primary : colors.border,
              backgroundColor: isActive ? colors.primary + "22" : colors.surface,
              borderRadius: radius.md,
              paddingHorizontal: 12,
              paddingVertical: 8,
            }}
            onPress={() => onSelect(tab.name)}
          >
            <Text style={{ color: isActive ? colors.primary : colors.text, fontSize: 12.5, fontWeight: "700" }}>{tab.name || "All Categories"}</Text>
            <Text style={{ color: isActive ? colors.primary : colors.textMuted, fontSize: 11, fontWeight: "700" }}>{tab.count}</Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}
