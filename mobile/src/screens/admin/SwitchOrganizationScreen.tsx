import { useState } from "react";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import { ActivityIndicator, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../theme/ThemeContext";
import { useAuth } from "../../auth/AuthContext";
import { MoreStackParamList } from "../../navigation/types";

// Mirrors client/src/pages/appSettings/OrgSwitchConfirmModal.tsx — re-verifies the caller's own
// credential before handing back a token scoped to the target organization's schema.
export function SwitchOrganizationScreen() {
  const { colors, spacing, radius } = useTheme();
  const navigation = useNavigation();
  const route = useRoute<RouteProp<MoreStackParamList, "SwitchOrganization">>();
  const { user, switchOrganization } = useAuth();
  const [usePin, setUsePin] = useState(false);
  const [password, setPassword] = useState("");
  const [pin, setPin] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    setSubmitting(true);
    setError(null);
    try {
      await switchOrganization(route.params.id, usePin ? { pin } : { password });
      navigation.goBack();
    } catch (err: any) {
      setError(err?.response?.data?.error ?? "Could not verify your credential.");
    } finally {
      setSubmitting(false);
    }
  }

  const canSubmit = usePin ? pin.trim().length > 0 : password.trim().length > 0;
  const inputStyle = { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: colors.text, backgroundColor: colors.surface };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, padding: spacing.lg }}>
      <Text style={{ color: colors.text, fontSize: 15, fontWeight: "700" }}>Switch to {route.params.name}?</Text>
      <Text style={{ color: colors.textMuted, fontSize: 12.5, marginTop: 6, marginBottom: spacing.lg }}>
        Confirm your credential to move into this organization's data. You can switch back the same way.
      </Text>

      {error && (
        <View style={{ backgroundColor: colors.danger + "22", borderRadius: radius.md, padding: 12, marginBottom: spacing.md }}>
          <Text style={{ color: colors.danger, fontSize: 13 }}>{error}</Text>
        </View>
      )}

      {user?.pinEnabled && (
        <View style={{ flexDirection: "row", gap: 8, marginBottom: spacing.md }}>
          {[{ key: false, label: "Password" }, { key: true, label: "PIN" }].map((opt) => (
            <TouchableOpacity
              key={String(opt.key)}
              style={{ borderWidth: 1, borderColor: usePin === opt.key ? colors.primary : colors.border, backgroundColor: usePin === opt.key ? colors.primary + "22" : colors.surface, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 8 }}
              onPress={() => setUsePin(opt.key)}
            >
              <Text style={{ color: usePin === opt.key ? colors.primary : colors.text, fontSize: 12.5, fontWeight: "700" }}>{opt.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {usePin ? (
        <TextInput style={inputStyle} placeholder="PIN" placeholderTextColor={colors.textMuted} keyboardType="number-pad" secureTextEntry value={pin} onChangeText={setPin} autoFocus />
      ) : (
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <TextInput style={[inputStyle, { flex: 1 }]} placeholder="Password" placeholderTextColor={colors.textMuted} secureTextEntry={!showPassword} value={password} onChangeText={setPassword} autoFocus />
          <TouchableOpacity style={{ position: "absolute", right: 12 }} onPress={() => setShowPassword((v) => !v)}>
            <Ionicons name={showPassword ? "eye-off-outline" : "eye-outline"} size={18} color={colors.textMuted} />
          </TouchableOpacity>
        </View>
      )}

      <TouchableOpacity
        style={{ backgroundColor: colors.primary, borderRadius: radius.md, alignItems: "center", paddingVertical: 15, marginTop: spacing.xl, opacity: canSubmit ? 1 : 0.6 }}
        disabled={!canSubmit || submitting}
        onPress={confirm}
      >
        {submitting ? <ActivityIndicator color="#fff" /> : <Text style={{ color: "#fff", fontWeight: "700" }}>Switch Organization</Text>}
      </TouchableOpacity>
    </View>
  );
}
