import { useRef, useState } from "react";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { ActivityIndicator, Alert, Text, TouchableOpacity, View } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { Ionicons } from "@expo/vector-icons";
import { axiosClient } from "../../api/axiosClient";
import { useTheme } from "../../theme/ThemeContext";
import { StockStackParamList } from "../../navigation/types";

export function StockScanScreen() {
  const { colors, spacing, radius } = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<StockStackParamList>>();
  const [permission, requestPermission] = useCameraPermissions();
  const [lookingUp, setLookingUp] = useState(false);
  const scannedRef = useRef(false);

  async function handleScan(data: string) {
    if (scannedRef.current) return;
    scannedRef.current = true;
    setLookingUp(true);
    try {
      const res = await axiosClient.get(`/stock/by-sku/${encodeURIComponent(data)}`);
      navigation.replace("StockDetail", { id: res.data.id });
    } catch {
      Alert.alert("Not found", `No stock item found with SKU "${data}"`, [
        { text: "OK", onPress: () => { scannedRef.current = false; setLookingUp(false); } },
      ]);
    }
  }

  if (!permission) return <View style={{ flex: 1, backgroundColor: colors.bg }} />;

  if (!permission.granted) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg, padding: spacing.xl }}>
        <Ionicons name="camera-outline" size={40} color={colors.textMuted} />
        <Text style={{ color: colors.text, fontSize: 15, fontWeight: "700", marginTop: spacing.md, textAlign: "center" }}>
          Camera access is needed to scan stock QR codes
        </Text>
        <TouchableOpacity style={{ backgroundColor: colors.primary, borderRadius: radius.md, paddingHorizontal: 20, paddingVertical: 12, marginTop: spacing.lg }} onPress={requestPermission}>
          <Text style={{ color: "#fff", fontWeight: "700" }}>Grant permission</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: "#000" }}>
      <CameraView style={{ flex: 1 }} barcodeScannerSettings={{ barcodeTypes: ["qr", "code128", "ean13", "code39"] }} onBarcodeScanned={({ data }) => handleScan(data)} />
      <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "center" }} pointerEvents="none">
        <View style={{ width: 230, height: 230, borderWidth: 2, borderColor: "#fff", borderRadius: radius.lg }} />
      </View>
      {lookingUp && (
        <View style={{ position: "absolute", bottom: 60, left: 0, right: 0, alignItems: "center" }}>
          <ActivityIndicator color="#fff" />
        </View>
      )}
    </View>
  );
}
