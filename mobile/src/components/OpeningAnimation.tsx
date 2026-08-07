import { useEffect } from "react";
import { View } from "react-native";
import Animated, { Easing, useAnimatedStyle, useSharedValue, withSequence, withTiming } from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../theme/ThemeContext";

export type OpeningAnimationKind = "door" | "light" | "gate";

// Lightweight command-feedback animation shown while an open/on command is in flight or has just
// succeeded — no Lottie dependency, just Reanimated primitives (same tool Shimmer.tsx already
// uses for the app's other animations). Retrigger by bumping `playKey` on every mutate() call.
export function OpeningAnimation({
  kind,
  playKey,
  size = 40,
  active = false,
}: {
  kind: OpeningAnimationKind;
  playKey: number;
  size?: number;
  active?: boolean;
}) {
  const { colors } = useTheme();
  const progress = useSharedValue(0);
  const glow = useSharedValue(0);

  useEffect(() => {
    progress.value = 0;
    progress.value = withTiming(1, { duration: 650, easing: Easing.out(Easing.cubic) });
    if (kind === "light") {
      glow.value = 0;
      glow.value = withSequence(withTiming(1, { duration: 350 }), withTiming(0.55, { duration: 350 }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playKey, kind]);

  const doorStyle = useAnimatedStyle(() => ({
    transform: [{ perspective: 300 }, { rotateY: `${progress.value * -55}deg` }],
  }));
  const gateStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: progress.value * -(size * 0.35) }, { rotate: `${progress.value * -65}deg` }],
  }));
  const glowStyle = useAnimatedStyle(() => ({
    opacity: glow.value,
    transform: [{ scale: 0.8 + glow.value * 0.6 }],
  }));

  const activeColor = active ? colors.success : colors.primary;

  if (kind === "light") {
    return (
      <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
        <Animated.View style={[{ position: "absolute", width: size, height: size, borderRadius: size / 2, backgroundColor: colors.warning }, glowStyle]} />
        <Ionicons name={active ? "bulb" : "bulb-outline"} size={size * 0.7} color={active ? colors.warning : colors.textMuted} />
      </View>
    );
  }

  if (kind === "gate") {
    return (
      <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
        <Animated.View style={gateStyle}>
          <Ionicons name="remove-outline" size={size * 0.9} color={activeColor} />
        </Animated.View>
      </View>
    );
  }

  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <Animated.View style={doorStyle}>
        <Ionicons name="exit-outline" size={size * 0.75} color={activeColor} />
      </Animated.View>
    </View>
  );
}
