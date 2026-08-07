import { useEffect, useRef, useState } from "react";
import { useNavigation } from "@react-navigation/native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Animated, Easing, Image, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { axiosClient } from "../api/axiosClient";
import { API_ORIGIN } from "../config/env";
import { useAuth } from "../auth/AuthContext";
import { useTheme } from "../theme/ThemeContext";
import { useToast } from "./toast/ToastProvider";
import { AccountMenuSheet } from "./AccountMenuSheet";

// Rendered as headerLeft/headerRight on the root screen of every bottom-tab stack (Home, Assets,
// Stock, Helpdesk, More) — see the *Stack.tsx files. Not shown on nested/detail screens, which
// keep the default back-button header.
export function AppHeader() {
  const { colors } = useTheme();
  const { user } = useAuth();
  const { showToast } = useToast();
  const navigation = useNavigation<any>();
  const queryClient = useQueryClient();
  const [menuOpen, setMenuOpen] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const spin = useRef(new Animated.Value(0)).current;

  const { data } = useQuery({
    queryKey: ["mobile-header-notifications"],
    queryFn: async () => (await axiosClient.get("/notifications")).data as { unreadCount: number },
    refetchInterval: 60000,
  });
  const unreadCount = data?.unreadCount ?? 0;

  useEffect(() => {
    if (!isSyncing) {
      spin.setValue(0);
      return;
    }
    const anim = Animated.loop(Animated.timing(spin, { toValue: 1, duration: 800, easing: Easing.linear, useNativeDriver: true }));
    anim.start();
    return () => anim.stop();
  }, [isSyncing, spin]);

  async function runSync() {
    if (isSyncing) return;
    setIsSyncing(true);
    try {
      await queryClient.refetchQueries({ type: "active" });
      showToast({ variant: "success", title: "Sync complete", message: "All items are up to date." });
    } catch {
      showToast({ variant: "error", title: "Sync failed", message: "Couldn't refresh data. Check your connection and try again." });
    } finally {
      setIsSyncing(false);
    }
  }

  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] });
  const initial = user?.firstName?.[0]?.toUpperCase() ?? "?";
  const avatarUrl = user?.avatarUrl ? `${API_ORIGIN}${user.avatarUrl}` : null;

  return (
    <>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 16, paddingRight: 4 }}>
        <TouchableOpacity onPress={runSync} disabled={isSyncing} accessibilityLabel="Sync">
          <Animated.View style={{ transform: [{ rotate }] }}>
            <Ionicons name="sync-outline" size={21} color={isSyncing ? colors.primary : colors.text} />
          </Animated.View>
        </TouchableOpacity>

        <TouchableOpacity onPress={() => navigation.getParent()?.navigate("MoreTab", { screen: "Notifications" })} accessibilityLabel="Notifications" style={{ padding: 5 }}>
          <View>
            <Ionicons name="notifications-outline" size={22} color={colors.text} />
            {unreadCount > 0 && (
              <View
                style={{
                  position: "absolute",
                  top: -2,
                  right: -4,
                  minWidth: 15,
                  height: 15,
                  borderRadius: 8,
                  paddingHorizontal: 3,
                  backgroundColor: colors.danger,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text style={{ color: "#fff", fontSize: 9.5, fontWeight: "800" }}>{unreadCount > 99 ? "99+" : unreadCount}</Text>
              </View>
            )}
          </View>
        </TouchableOpacity>

        <TouchableOpacity onPress={() => setMenuOpen(true)} accessibilityLabel="Account menu">
          {avatarUrl ? (
            <Image source={{ uri: avatarUrl }} style={{ width: 30, height: 30, borderRadius: 15 }} />
          ) : (
            <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" }}>
              <Text style={{ color: "#fff", fontSize: 13, fontWeight: "800" }}>{initial}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      <AccountMenuSheet visible={menuOpen} onClose={() => setMenuOpen(false)} onSync={runSync} isSyncing={isSyncing} unreadCount={unreadCount} />
    </>
  );
}
