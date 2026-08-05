import { useState } from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../theme/ThemeContext";
import { MediaLibraryScreen } from "./MediaLibraryScreen";
import { AttachedUploadsScreen } from "./AttachedUploadsScreen";

export function MediaCenterHomeScreen() {
  const { colors, spacing, radius } = useTheme();
  const [subTab, setSubTab] = useState<"library" | "attached">("library");

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ flexDirection: "row", gap: 8, padding: spacing.lg, paddingBottom: 0 }}>
        {(["library", "attached"] as const).map((t) => (
          <TouchableOpacity
            key={t}
            style={{ flexDirection: "row", alignItems: "center", gap: 5, borderWidth: 1, borderColor: subTab === t ? colors.primary : colors.border, backgroundColor: subTab === t ? colors.primary + "22" : colors.surface, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 8 }}
            onPress={() => setSubTab(t)}
          >
            <Ionicons name={t === "library" ? "image-outline" : "attach-outline"} size={14} color={subTab === t ? colors.primary : colors.text} />
            <Text style={{ color: subTab === t ? colors.primary : colors.text, fontSize: 12.5, fontWeight: "700" }}>{t === "library" ? "Media Library" : "Attached Uploads"}</Text>
          </TouchableOpacity>
        ))}
      </View>
      {subTab === "library" ? <MediaLibraryScreen /> : <AttachedUploadsScreen />}
    </View>
  );
}
