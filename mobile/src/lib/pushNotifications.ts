import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
import { axiosClient } from "../api/axiosClient";

// Registered on login/app-start against POST /notifications/push-tokens (see
// server/src/modules/notifications/notifications.routes.ts), consumed by
// server/src/lib/pushNotify.ts whenever notify.ts fires an in-app notification — push mirrors the
// in-app feed rather than being a separate channel. Silently no-ops on anything that can't
// receive push (simulators, denied permission, web) rather than surfacing an error to the user —
// push is a nice-to-have, not something that should block using the app.
let lastRegisteredToken: string | null = null;

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export async function registerForPushNotifications() {
  try {
    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("default", {
        name: "default",
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    }

    const existing = await Notifications.getPermissionsAsync();
    let status = existing.status;
    if (status !== "granted") {
      const requested = await Notifications.requestPermissionsAsync();
      status = requested.status;
    }
    if (status !== "granted") return;

    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    const { data: token } = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
    if (!token || token === lastRegisteredToken) return;

    await axiosClient.post("/notifications/push-tokens", { token, platform: Platform.OS === "ios" ? "ios" : "android" });
    lastRegisteredToken = token;
  } catch {
    // Expected on simulators/emulators without push capability, or if permission was denied —
    // the rest of the app works fine without a registered token.
  }
}

export async function unregisterPushToken() {
  if (!lastRegisteredToken) return;
  const token = lastRegisteredToken;
  lastRegisteredToken = null;
  await axiosClient.delete(`/notifications/push-tokens/${encodeURIComponent(token)}`).catch(() => undefined);
}
