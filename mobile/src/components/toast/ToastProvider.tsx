import { createContext, ReactNode, useCallback, useContext, useEffect, useRef, useState } from "react";
import { Animated, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../../theme/ThemeContext";

export type ToastVariant = "success" | "error" | "info";

export interface ToastOptions {
  variant?: ToastVariant;
  title: string;
  message?: string;
  duration?: number;
}

interface ToastContextValue {
  showToast: (opts: ToastOptions) => void;
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

type Listener = (opts: ToastOptions) => void;
let globalListener: Listener | null = null;

// Lets code outside the React tree — globalErrorHandling.ts's ErrorUtils/promise-rejection hooks,
// ErrorBoundary's componentDidCatch (a class lifecycle method, not a hook) — surface a toast
// without needing a useToast() call, which neither of those call sites can make.
export function showGlobalToast(opts: ToastOptions): void {
  globalListener?.(opts);
}

interface ActiveToast extends ToastOptions {
  id: number;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const { colors, spacing, radius } = useTheme();
  const insets = useSafeAreaInsets();
  const [toast, setToast] = useState<ActiveToast | null>(null);
  const opacity = useRef(new Animated.Value(0)).current;
  const idRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dismiss = useCallback(() => {
    Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => setToast(null));
  }, [opacity]);

  const showToast = useCallback(
    (opts: ToastOptions) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      idRef.current += 1;
      setToast({ id: idRef.current, ...opts });
      opacity.setValue(0);
      Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }).start();
      timerRef.current = setTimeout(dismiss, opts.duration ?? 3500);
    },
    [dismiss, opacity]
  );

  useEffect(() => {
    globalListener = showToast;
    return () => {
      globalListener = null;
    };
  }, [showToast]);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    []
  );

  const variantMeta: Record<ToastVariant, { color: string; icon: keyof typeof Ionicons.glyphMap }> = {
    success: { color: colors.success, icon: "checkmark-circle" },
    error: { color: colors.danger, icon: "alert-circle" },
    info: { color: colors.primary, icon: "information-circle" },
  };

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {toast && (
        <Animated.View
          pointerEvents="none"
          style={{
            position: "absolute",
            left: spacing.lg,
            right: spacing.lg,
            bottom: insets.bottom + spacing.lg,
            opacity,
            transform: [{ translateY: opacity.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }],
          }}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "flex-start",
              gap: spacing.sm,
              backgroundColor: colors.surface,
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: radius.lg,
              padding: spacing.md,
              shadowColor: "#000",
              shadowOpacity: 0.18,
              shadowRadius: 12,
              shadowOffset: { width: 0, height: 4 },
              elevation: 6,
            }}
          >
            <Ionicons name={variantMeta[toast.variant ?? "info"].icon} size={20} color={variantMeta[toast.variant ?? "info"].color} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.text, fontSize: 13.5, fontWeight: "700" }}>{toast.title}</Text>
              {toast.message && <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }}>{toast.message}</Text>}
            </View>
          </View>
        </Animated.View>
      )}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}
