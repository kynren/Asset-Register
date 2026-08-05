import { useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { useAuth } from "../../auth/AuthContext";
import { useTheme } from "../../theme/ThemeContext";
import { axiosClient } from "../../api/axiosClient";

export function LoginScreen() {
  const { colors, spacing, radius } = useTheme();
  const { login } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pin, setPin] = useState("");
  const [usePin, setUsePin] = useState(false);
  const [pinAvailable, setPinAvailable] = useState(false);
  const [mfaToken, setMfaToken] = useState("");
  const [mfaRequired, setMfaRequired] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function checkPinAvailable(nextEmail: string) {
    setEmail(nextEmail);
    if (!nextEmail.includes("@")) {
      setPinAvailable(false);
      return;
    }
    try {
      const res = await axiosClient.get("/auth/pin-available", { params: { email: nextEmail } });
      setPinAvailable(Boolean(res.data.pinAvailable));
    } catch {
      setPinAvailable(false);
    }
  }

  async function handleSubmit() {
    setError(null);
    setSubmitting(true);
    try {
      const credential = usePin ? { pin } : { password };
      const result = await login(email.trim().toLowerCase(), credential, mfaRequired ? mfaToken : undefined);
      if (result.mfaRequired) {
        setMfaRequired(true);
      }
    } catch (err: any) {
      setError(err?.response?.data?.error ?? "Login failed. Check your credentials and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.bg }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={[styles.card, { backgroundColor: colors.surface, borderRadius: radius.xl, padding: spacing.xl, borderColor: colors.border }]}>
        <Text style={[styles.title, { color: colors.text }]}>Kynren Asset Register</Text>
        <Text style={[styles.subtitle, { color: colors.textMuted, marginBottom: spacing.xl }]}>Sign in to continue</Text>

        {error && (
          <View style={[styles.errorBox, { backgroundColor: colors.danger + "22", borderRadius: radius.md, marginBottom: spacing.md }]}>
            <Text style={{ color: colors.danger, fontSize: 13 }}>{error}</Text>
          </View>
        )}

        {!mfaRequired ? (
          <>
            <Text style={[styles.label, { color: colors.textMuted }]}>Email</Text>
            <TextInput
              style={[styles.input, { borderColor: colors.border, color: colors.text, borderRadius: radius.md }]}
              autoCapitalize="none"
              keyboardType="email-address"
              placeholder="you@company.com"
              placeholderTextColor={colors.textMuted}
              value={email}
              onChangeText={checkPinAvailable}
            />

            {pinAvailable && (
              <TouchableOpacity onPress={() => setUsePin((v) => !v)} style={{ marginVertical: spacing.sm }}>
                <Text style={{ color: colors.primary, fontSize: 13, fontWeight: "600" }}>
                  {usePin ? "Use password instead" : "Log in with PIN instead"}
                </Text>
              </TouchableOpacity>
            )}

            <Text style={[styles.label, { color: colors.textMuted, marginTop: spacing.sm }]}>{usePin ? "PIN" : "Password"}</Text>
            <TextInput
              style={[styles.input, { borderColor: colors.border, color: colors.text, borderRadius: radius.md }]}
              secureTextEntry
              keyboardType={usePin ? "number-pad" : "default"}
              placeholder={usePin ? "••••" : "••••••••"}
              placeholderTextColor={colors.textMuted}
              value={usePin ? pin : password}
              onChangeText={usePin ? setPin : setPassword}
            />
          </>
        ) : (
          <>
            <Text style={[styles.label, { color: colors.textMuted }]}>Authentication code</Text>
            <TextInput
              style={[styles.input, { borderColor: colors.border, color: colors.text, borderRadius: radius.md }]}
              keyboardType="number-pad"
              placeholder="6-digit code"
              placeholderTextColor={colors.textMuted}
              value={mfaToken}
              onChangeText={setMfaToken}
              autoFocus
            />
          </>
        )}

        <TouchableOpacity
          style={[styles.button, { backgroundColor: colors.primary, borderRadius: radius.md, marginTop: spacing.lg }]}
          onPress={handleSubmit}
          disabled={submitting || !email || (!mfaRequired && !usePin && !password) || (!mfaRequired && usePin && !pin) || (mfaRequired && !mfaToken)}
        >
          {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>{mfaRequired ? "Verify" : "Sign in"}</Text>}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "center", justifyContent: "center", padding: 20 },
  card: { width: "100%", maxWidth: 420, borderWidth: 1 },
  title: { fontSize: 22, fontWeight: "800" },
  subtitle: { fontSize: 14 },
  label: { fontSize: 12, fontWeight: "600", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.4 },
  input: { borderWidth: 1, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, marginBottom: 4 },
  errorBox: { padding: 12 },
  button: { paddingVertical: 14, alignItems: "center" },
  buttonText: { color: "#fff", fontWeight: "700", fontSize: 15 },
});
