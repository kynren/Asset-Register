import "react-native-gesture-handler";
import { KeyboardAvoidingView, Platform } from "react-native";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "./src/auth/AuthContext";
import { ThemeProvider, useTheme } from "./src/theme/ThemeContext";
import { RootNavigator } from "./src/navigation/RootNavigator";
import { OfflineBanner } from "./src/components/OfflineBanner";
import { ErrorBoundary } from "./src/components/ErrorBoundary";
import { ToastProvider } from "./src/components/toast/ToastProvider";
import { AppLoadingScreen } from "./src/components/AppLoadingScreen";
import { queryClient } from "./src/lib/queryClient";
import { installGlobalErrorHandlers } from "./src/lib/globalErrorHandling";

installGlobalErrorHandlers();
// Keeps the native launch screen (app.json's expo-splash-screen config) up until
// AppLoadingScreen explicitly hides it once the org's custom loading media (or the app itself,
// if none is configured) is ready to display — see AppLoadingScreen.tsx for the handoff.
SplashScreen.preventAutoHideAsync().catch(() => undefined);

function AppShell() {
  const { isDark } = useTheme();
  return (
    <>
      {/* windowSoftInputMode is set to "resize" on Android (app.json), so only iOS needs this —
          Android already shrinks the whole window when the keyboard opens. Without this, a text
          input near the bottom of a form's ScrollView sits directly under the keyboard with no
          way to see what's being typed. */}
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <AppLoadingScreen>
          <RootNavigator />
        </AppLoadingScreen>
      </KeyboardAvoidingView>
      <OfflineBanner />
      <StatusBar style={isDark ? "light" : "dark"} />
    </>
  );
}

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <ThemeProvider>
            <ToastProvider>
              <ErrorBoundary>
                <AuthProvider>
                  <AppShell />
                </AuthProvider>
              </ErrorBoundary>
            </ToastProvider>
          </ThemeProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
