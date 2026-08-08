import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { AssetListScreen } from "../screens/assets/AssetListScreen";
import { AssetDetailScreen } from "../screens/assets/AssetDetailScreen";
import { AssetFormScreen } from "../screens/assets/AssetFormScreen";
import { AssetScanScreen } from "../screens/assets/AssetScanScreen";
import { AssetImportScreen } from "../screens/assets/AssetImportScreen";
import { DiscoverAssetsScreen } from "../screens/assets/DiscoverAssetsScreen";
import { AssetCollectionsScreen } from "../screens/assets/AssetCollectionsScreen";
import { AppHeader } from "../components/AppHeader";
import { useTheme } from "../theme/ThemeContext";
import { AssetsStackParamList } from "./types";

const Stack = createNativeStackNavigator<AssetsStackParamList>();

export function AssetsStack() {
  const { colors } = useTheme();
  return (
    <Stack.Navigator screenOptions={{ headerStyle: { backgroundColor: colors.surface }, headerTintColor: colors.text, headerShadowVisible: false }}>
      <Stack.Screen name="AssetsList" component={AssetListScreen} options={{ title: "Asset Inventory", headerRight: () => <AppHeader /> }} />
      <Stack.Screen name="AssetDetail" component={AssetDetailScreen} options={{ title: "Asset" }} />
      <Stack.Screen name="AssetForm" component={AssetFormScreen} options={({ route }) => ({ title: route.params?.id ? "Edit Asset" : "New Asset" })} />
      <Stack.Screen name="AssetScan" component={AssetScanScreen} options={{ title: "Scan Asset", headerStyle: { backgroundColor: "#000" }, headerTintColor: "#fff" }} />
      <Stack.Screen name="AssetImport" component={AssetImportScreen} options={{ title: "Import CSV" }} />
      <Stack.Screen name="DiscoverAssets" component={DiscoverAssetsScreen} options={{ title: "Discover Assets" }} />
      <Stack.Screen name="AssetCollections" component={AssetCollectionsScreen} options={{ title: "Collections" }} />
    </Stack.Navigator>
  );
}
