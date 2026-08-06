import { Component, ReactNode } from "react";
import { Alert, Text, TouchableOpacity, View } from "react-native";
import { useTheme } from "../theme/ThemeContext";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

// Themed separately from ErrorBoundary itself since useTheme is a hook and error boundaries must
// be class components (React has no hook equivalent of componentDidCatch/getDerivedStateFromError).
// Requires ErrorBoundary to sit inside ThemeProvider in the component tree — see App.tsx.
function ErrorBoundaryFallback({ onRetry }: { onRetry: () => void }) {
  const { colors, spacing, radius } = useTheme();
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl, backgroundColor: colors.bg }}>
      <Text style={{ color: colors.text, fontSize: 17, fontWeight: "700", marginBottom: spacing.xs }}>Something went wrong</Text>
      <Text style={{ color: colors.textMuted, fontSize: 13, textAlign: "center", marginBottom: spacing.lg }}>
        Try again — if this keeps happening, restart the app.
      </Text>
      <TouchableOpacity style={{ backgroundColor: colors.primary, borderRadius: radius.md, paddingHorizontal: 20, paddingVertical: 12 }} onPress={onRetry}>
        <Text style={{ color: "#fff", fontWeight: "700", fontSize: 14 }}>Try Again</Text>
      </TouchableOpacity>
    </View>
  );
}

// Catches render-time errors anywhere below it in the tree — the one class of crash React's own
// error handling can surface, but that ErrorUtils/promise rejection tracking (globalErrorHandling.ts)
// can't, since those only see errors thrown outside of a render pass. Shown as a native Alert to
// match the rest of the app's uncaught-error handling, then falls back to a themed recovery screen
// (Alert alone can't replace the crashed tree — something has to render in its place).
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    Alert.alert("Something Went Wrong", error.message || "An unexpected error occurred.", [{ text: "OK" }]);
  }

  reset = () => this.setState({ hasError: false });

  render() {
    if (this.state.hasError) return <ErrorBoundaryFallback onRetry={this.reset} />;
    return this.props.children;
  }
}
