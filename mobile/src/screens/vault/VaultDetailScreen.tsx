import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { ActivityIndicator, Alert, ScrollView, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { axiosClient } from "../../api/axiosClient";
import { useAuth } from "../../auth/AuthContext";
import { useTheme } from "../../theme/ThemeContext";
import { ShimmerDetail } from "../../components/Shimmer";
import { VaultEntry, VaultSettings } from "../../types/vault";
import { MoreStackParamList } from "../../navigation/types";

// Mirrors the web vault's reveal behavior: password stays decrypted only in local state (never
// cached in React Query, never persisted) and auto-re-encrypts (cleared from state) after
// GET /vault/settings's decryptTimeoutSeconds — same server-driven timeout, same "don't leave a
// plaintext secret on screen indefinitely" rule, just a countdown label instead of the web app's
// sci-fi decrypt animation.
export function VaultDetailScreen() {
  const { colors, spacing, radius } = useTheme();
  const { hasPermission } = useAuth();
  const navigation = useNavigation<NativeStackNavigationProp<MoreStackParamList>>();
  const route = useRoute<RouteProp<MoreStackParamList, "VaultDetail">>();
  const { id } = route.params;
  const queryClient = useQueryClient();

  const [revealed, setRevealed] = useState<string | null>(null);
  const [remaining, setRemaining] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const { data: entries, isLoading } = useQuery({
    queryKey: ["mobile-vault"],
    queryFn: async () => (await axiosClient.get("/vault")).data as VaultEntry[],
  });
  const entry = entries?.find((e) => e.id === id);

  const { data: settings } = useQuery({
    queryKey: ["mobile-vault-settings"],
    queryFn: async () => (await axiosClient.get("/vault/settings")).data as VaultSettings,
  });

  function clearTimer() {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
  }

  function hide() {
    clearTimer();
    setRevealed(null);
    setRemaining(0);
  }

  useEffect(() => {
    setRevealed(null);
    setRemaining(0);
    return () => clearTimer();
  }, [id]);

  const revealMutation = useMutation({
    mutationFn: () => axiosClient.post(`/vault/${id}/reveal`),
    onSuccess: (res) => {
      const timeout = settings?.decryptTimeoutSeconds ?? 60;
      setRevealed(res.data.password);
      setRemaining(timeout);
      clearTimer();
      timerRef.current = setInterval(() => {
        setRemaining((r) => {
          if (r <= 1) {
            hide();
            return 0;
          }
          return r - 1;
        });
      }, 1000);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => axiosClient.delete(`/vault/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mobile-vault"] });
      navigation.goBack();
    },
  });

  function confirmDelete() {
    Alert.alert("Delete vault entry", `Delete "${entry?.title}"? This can't be undone.`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => deleteMutation.mutate() },
    ]);
  }

  useLayoutEffect(() => {
    navigation.setOptions({
      title: entry?.title ?? "Vault Entry",
      headerRight: () =>
        hasPermission("password", "edit") ? (
          <TouchableOpacity onPress={() => navigation.navigate("VaultForm", { id })} style={{ paddingHorizontal: 4 }}>
            <Ionicons name="create-outline" size={22} color={colors.primary} />
          </TouchableOpacity>
        ) : null,
    });
  }, [navigation, entry, id, colors.primary]);

  if (isLoading || !entry) {
    return <ShimmerDetail />;
  }

  const rows: [string, string | null][] = [
    ["Website", entry.websiteUrl],
    ["Username", entry.username],
    ["Notes", entry.notes],
  ];

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: spacing.lg }}>
      <View style={{ backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.lg, marginBottom: spacing.lg }}>
        {rows
          .filter(([, v]) => v !== null)
          .map(([label, value], i, arr) => (
            <View key={label} style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 12, borderBottomWidth: i < arr.length - 1 ? 1 : 0, borderBottomColor: colors.border }}>
              <Text style={{ color: colors.textMuted, fontSize: 13 }}>{label}</Text>
              <Text style={{ color: colors.text, fontSize: 13, fontWeight: "600", flex: 1, textAlign: "right", marginLeft: 12 }} selectable>
                {value}
              </Text>
            </View>
          ))}
      </View>

      <View style={{ backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, alignItems: "center" }}>
        <Text style={{ color: colors.textMuted, fontSize: 12, fontWeight: "700", textTransform: "uppercase", marginBottom: 10 }}>Password</Text>
        {revealed ? (
          <>
            <Text style={{ color: colors.text, fontSize: 18, fontWeight: "700", letterSpacing: 1 }} selectable>
              {revealed}
            </Text>
            <Text style={{ color: colors.warning, fontSize: 11.5, marginTop: 10 }}>Re-encrypting in {remaining}s</Text>
            <TouchableOpacity onPress={hide} style={{ marginTop: 10 }}>
              <Text style={{ color: colors.primary, fontSize: 12.5, fontWeight: "600" }}>Hide now</Text>
            </TouchableOpacity>
          </>
        ) : (
          <TouchableOpacity
            style={{ flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.primary, borderRadius: radius.md, paddingHorizontal: 20, paddingVertical: 11 }}
            onPress={() => revealMutation.mutate()}
            disabled={revealMutation.isPending}
          >
            {revealMutation.isPending ? <ActivityIndicator color="#fff" size="small" /> : <Ionicons name="eye-outline" size={16} color="#fff" />}
            <Text style={{ color: "#fff", fontWeight: "700" }}>Reveal password</Text>
          </TouchableOpacity>
        )}
      </View>

      {hasPermission("password", "delete") && (
        <TouchableOpacity
          style={{ marginTop: spacing.xl, borderWidth: 1.5, borderColor: colors.danger, borderRadius: radius.md, alignItems: "center", paddingVertical: 14 }}
          onPress={confirmDelete}
          disabled={deleteMutation.isPending}
        >
          <Text style={{ color: colors.danger, fontWeight: "700" }}>Delete vault entry</Text>
        </TouchableOpacity>
      )}
    </ScrollView>
  );
}
