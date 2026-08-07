import { ReactNode } from "react";
import { KeyboardAvoidingView, Modal, Platform, Text, TouchableOpacity, TouchableWithoutFeedback, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../theme/ThemeContext";

// Reusable bottom-sheet shell — the same transparent-Modal + flex-end sliding panel pattern
// GatesScreen's Net2ServerForm already used, pulled out so Doors/Lighting/Gates share one
// implementation instead of each hand-rolling it. Tapping the backdrop dismisses; tapping the
// panel itself doesn't (via the inner TouchableWithoutFeedback swallowing the bubble).
export function BottomSheet({
  visible,
  onClose,
  title,
  children,
  maxHeightPercent = 85,
}: {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  maxHeightPercent?: number;
}) {
  const { colors, spacing, radius } = useTheme();

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <TouchableWithoutFeedback onPress={onClose}>
          <View style={{ flex: 1, backgroundColor: "#0008", justifyContent: "flex-end" }}>
            <TouchableWithoutFeedback>
              <View
                style={{
                  backgroundColor: colors.surface,
                  borderTopLeftRadius: radius.lg,
                  borderTopRightRadius: radius.lg,
                  paddingTop: spacing.sm,
                  paddingHorizontal: spacing.lg,
                  paddingBottom: spacing.xl,
                  maxHeight: `${maxHeightPercent}%`,
                }}
              >
                <View style={{ alignSelf: "center", width: 36, height: 4, borderRadius: 2, backgroundColor: colors.border, marginBottom: spacing.md }} />
                {title && (
                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.md }}>
                    <Text style={{ color: colors.text, fontSize: 16, fontWeight: "700" }}>{title}</Text>
                    <TouchableOpacity onPress={onClose} accessibilityLabel="Close">
                      <Ionicons name="close" size={20} color={colors.textMuted} />
                    </TouchableOpacity>
                  </View>
                )}
                {children}
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
    </Modal>
  );
}
