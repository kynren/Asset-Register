import { KeyboardAvoidingView, Platform, ViewStyle } from "react-native";

// Drop-in root wrapper for any screen with TextInput fields — without it, focusing an input near
// the bottom of a form leaves the on-screen keyboard covering it instead of the screen scrolling
// the field into view. Same behavior LoginScreen.tsx/AssistantScreen.tsx already used ad hoc;
// this makes it a one-line addition for every other screen.
export function KeyboardAvoidingScreen({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return (
    <KeyboardAvoidingView style={[{ flex: 1 }, style]} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      {children}
    </KeyboardAvoidingView>
  );
}
