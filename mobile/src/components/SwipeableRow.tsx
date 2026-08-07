import { ReactNode, useRef } from "react";
import { Text, View } from "react-native";
import { Swipeable } from "react-native-gesture-handler";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../theme/ThemeContext";

// Swipe-right = open, swipe-left = close, used on Door/Lighting/Gate list rows. RNGH's naming is
// the reverse of what you'd guess: the panel that appears when the user drags the row TO THE
// RIGHT is `renderLeftActions` (it lives on the left, revealed as the row slides right), and vice
// versa. Each action panel fires its callback then closes the row immediately — these are
// one-shot commands, not a toggle left open.
export function SwipeableRow({
  children,
  onSwipeRight,
  onSwipeLeft,
  rightLabel = "Open",
  leftLabel = "Close",
  rightIcon = "lock-open-outline",
  leftIcon = "lock-closed-outline",
  disabled = false,
}: {
  children: ReactNode;
  onSwipeRight?: () => void;
  onSwipeLeft?: () => void;
  rightLabel?: string;
  leftLabel?: string;
  rightIcon?: keyof typeof Ionicons.glyphMap;
  leftIcon?: keyof typeof Ionicons.glyphMap;
  disabled?: boolean;
}) {
  const { colors } = useTheme();
  const ref = useRef<Swipeable>(null);

  if (disabled || (!onSwipeRight && !onSwipeLeft)) return <>{children}</>;

  return (
    <Swipeable
      ref={ref}
      overshootLeft={false}
      overshootRight={false}
      leftThreshold={56}
      rightThreshold={56}
      renderLeftActions={
        onSwipeRight
          ? () => (
              <View style={{ backgroundColor: colors.success, justifyContent: "center", alignItems: "center", width: 84 }}>
                <Ionicons name={rightIcon} size={20} color="#fff" />
                <Text style={{ color: "#fff", fontSize: 10.5, fontWeight: "700", marginTop: 2 }}>{rightLabel}</Text>
              </View>
            )
          : undefined
      }
      renderRightActions={
        onSwipeLeft
          ? () => (
              <View style={{ backgroundColor: colors.danger, justifyContent: "center", alignItems: "center", width: 84 }}>
                <Ionicons name={leftIcon} size={20} color="#fff" />
                <Text style={{ color: "#fff", fontSize: 10.5, fontWeight: "700", marginTop: 2 }}>{leftLabel}</Text>
              </View>
            )
          : undefined
      }
      onSwipeableOpen={(direction) => {
        if (direction === "left") onSwipeRight?.();
        else onSwipeLeft?.();
        ref.current?.close();
      }}
    >
      {children}
    </Swipeable>
  );
}
