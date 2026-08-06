import { Ionicons } from "@expo/vector-icons";
import { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../theme/ThemeContext";
import { MainTabParamList } from "./types";

const ICONS: Record<keyof MainTabParamList, keyof typeof Ionicons.glyphMap> = {
  HomeTab: "home",
  AssetsTab: "cube",
  StockTab: "layers",
  HelpdeskTab: "help-buoy",
  MoreTab: "grid",
};

// Renders HomeTab as a raised circular button breaking out of the bar's top edge (the layout the
// user referenced), while the other four tabs stay flat icon+label buttons either side of it. The
// visual slot order here (Assets, Stock, Home, Helpdesk, More) is independent of the tab
// navigator's declaration order in MainTabs.tsx, which keeps HomeTab declared first so it's still
// the screen shown on cold launch — position on the bar and "default route" are separate concerns.
const VISUAL_ORDER: (keyof MainTabParamList)[] = ["AssetsTab", "StockTab", "HomeTab", "HelpdeskTab", "MoreTab"];

export function CustomTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const { colors, spacing } = useTheme();
  const insets = useSafeAreaInsets();

  const routesByName = new Map(state.routes.map((r) => [r.name, r]));

  return (
    <View
      style={{
        flexDirection: "row",
        backgroundColor: colors.surface,
        borderTopWidth: 1,
        borderTopColor: colors.border,
        paddingBottom: Math.max(insets.bottom, spacing.sm),
        paddingTop: spacing.sm,
      }}
    >
      {VISUAL_ORDER.map((name) => {
        const route = routesByName.get(name);
        if (!route) return null;
        const routeIndex = state.routes.findIndex((r) => r.key === route.key);
        const isFocused = state.index === routeIndex;
        const { options } = descriptors[route.key];
        const label = (options.title ?? route.name) as string;

        function onPress() {
          const event = navigation.emit({ type: "tabPress", target: route!.key, canPreventDefault: true });
          if (!isFocused && !event.defaultPrevented) navigation.navigate(route!.name);
        }

        if (name === "HomeTab") {
          return (
            <View key={route.key} style={{ flex: 1, alignItems: "center" }}>
              <TouchableOpacity
                onPress={onPress}
                accessibilityRole="button"
                accessibilityState={isFocused ? { selected: true } : {}}
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: 28,
                  marginTop: -26,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: colors.primary,
                  borderWidth: 4,
                  borderColor: colors.surface,
                  shadowColor: "#000",
                  shadowOffset: { width: 0, height: 3 },
                  shadowOpacity: 0.25,
                  shadowRadius: 5,
                  elevation: 6,
                }}
              >
                <Ionicons name={ICONS[name]} size={24} color="#fff" />
              </TouchableOpacity>
              <Text style={{ fontSize: 10.5, fontWeight: "700", color: isFocused ? colors.primary : colors.textMuted, marginTop: 3 }}>
                {label}
              </Text>
            </View>
          );
        }

        return (
          <TouchableOpacity key={route.key} onPress={onPress} style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 2 }}>
            <Ionicons name={ICONS[name]} size={21} color={isFocused ? colors.primary : colors.textMuted} />
            <Text style={{ fontSize: 10.5, fontWeight: isFocused ? "700" : "600", color: isFocused ? colors.primary : colors.textMuted }}>
              {label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}
