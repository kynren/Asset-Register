import { createNavigationContainerRef } from "@react-navigation/native";
import { RootStackParamList } from "./types";

// Notifications is registered once, at the root stack (outside the per-tab stacks — see
// RootNavigator.tsx), so it can be opened as a modal from any tab and dismissed back to exactly
// the screen the user was on. Reaching the root stack from deep inside a tab's own stack via
// navigation.getParent() would only climb to the tab navigator, not past it — a shared ref is the
// standard React Navigation way to jump straight to the root regardless of nesting depth.
export const navigationRef = createNavigationContainerRef<RootStackParamList>();

export function navigateToNotifications() {
  if (navigationRef.isReady()) {
    navigationRef.navigate("Notifications");
  }
}
