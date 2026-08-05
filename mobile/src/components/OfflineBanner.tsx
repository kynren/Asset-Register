import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import NetInfo from "@react-native-community/netinfo";
import { useTheme } from "../theme/ThemeContext";
import { useSafeAreaInsets } from "react-native-safe-area-context";

// Mounted once at the app root (see App.tsx) so it's visible over every screen — a thin persistent
// strip rather than a dismissible toast, since "you're offline" stays true until it isn't and a
// user could otherwise dismiss it and forget. `isInternetReachable` starts `null` on some
// platforms until the first real check resolves, so only treat an explicit `false` as offline —
// not the initial unknown state, which would otherwise flash the banner on every cold start.
export function OfflineBanner() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      setOffline(state.isConnected === false || state.isInternetReachable === false);
    });
    return unsubscribe;
  }, []);

  if (!offline) return null;

  return (
    <View style={{ position: "absolute", top: 0, left: 0, right: 0, paddingTop: insets.top, backgroundColor: colors.danger, zIndex: 999 }}>
      <View style={{ paddingVertical: 6, alignItems: "center" }}>
        <Text style={{ color: "#fff", fontSize: 12, fontWeight: "700" }}>No internet connection</Text>
      </View>
    </View>
  );
}
