import { useEffect } from "react";
import { DimensionValue, View, ViewStyle } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from "react-native-reanimated";
import { useTheme } from "../theme/ThemeContext";

// The one pulsing primitive every shape below composes — a rounded block that fades between the
// theme's border and surface tones. Mirrors client/src/components/Skeleton.tsx's role on web:
// callers pick a width/height to describe a shape, this just supplies the animation and color.
export function ShimmerBlock({ width, height = 14, radius: cornerRadius = 6, style }: { width?: DimensionValue; height?: number; radius?: number; style?: ViewStyle }) {
  const { colors } = useTheme();
  const opacity = useSharedValue(0.5);

  useEffect(() => {
    opacity.value = withRepeat(withSequence(withTiming(1, { duration: 700 }), withTiming(0.5, { duration: 700 })), -1, true);
  }, [opacity]);

  const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <Animated.View
      style={[{ width, height, borderRadius: cornerRadius, backgroundColor: colors.border }, animatedStyle, style]}
    />
  );
}

// Placeholder for one row of a FlatList built from the card-tile shape used across every list
// screen in this app (surface background, bordered, rounded, title line + subtitle line).
export function ShimmerListItem() {
  const { colors, spacing, radius } = useTheme();
  return (
    <View style={{ backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, gap: spacing.xs }}>
      <ShimmerBlock width="55%" height={14} />
      <ShimmerBlock width="80%" height={12} />
    </View>
  );
}

// Drop-in replacement for a list screen's first-load `<ActivityIndicator />` — renders `count`
// row placeholders with the same outer padding/gap the real FlatList uses, so content doesn't
// jump when the real rows swap in. Never render this alongside a pull-to-refresh spinner or a
// load-more footer spinner for the same screen — first load is this, everything after is native
// RefreshControl / footer ActivityIndicator, not both at once.
export function ShimmerList({ count = 6 }: { count?: number }) {
  const { spacing } = useTheme();
  return (
    <View style={{ padding: spacing.lg, gap: spacing.sm }}>
      {Array.from({ length: count }).map((_, i) => (
        <ShimmerListItem key={i} />
      ))}
    </View>
  );
}

// Drop-in replacement for a detail screen's `if (isLoading) return <ActivityIndicator />` —
// a header block (title + subtitle) followed by a handful of field-row placeholders.
export function ShimmerDetail({ lines = 4 }: { lines?: number }) {
  const { colors, spacing, radius } = useTheme();
  return (
    <View style={{ padding: spacing.lg, gap: spacing.lg }}>
      <View style={{ gap: spacing.xs }}>
        <ShimmerBlock width="60%" height={20} />
        <ShimmerBlock width="40%" height={13} />
      </View>
      <View style={{ backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, gap: spacing.md }}>
        {Array.from({ length: lines }).map((_, i) => (
          <View key={i} style={{ gap: spacing.xs }}>
            <ShimmerBlock width="30%" height={11} />
            <ShimmerBlock width="70%" height={14} />
          </View>
        ))}
      </View>
    </View>
  );
}
