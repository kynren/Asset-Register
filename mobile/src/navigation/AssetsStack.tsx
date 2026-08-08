import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { AssetListScreen } from "../screens/assets/AssetListScreen";
import { AssetDetailScreen } from "../screens/assets/AssetDetailScreen";
import { AssetFormScreen } from "../screens/assets/AssetFormScreen";
import { AssetScanScreen } from "../screens/assets/AssetScanScreen";
import { AssetImportScreen } from "../screens/assets/AssetImportScreen";
import { DiscoverAssetsScreen } from "../screens/assets/DiscoverAssetsScreen";
import { AssetCollectionsScreen } from "../screens/assets/AssetCollectionsScreen";
import { AssetExplorerScreen } from "../screens/assets/AssetExplorerScreen";
import { AssetSubResourceScreen } from "../screens/assets/AssetSubResourceScreen";
import { AssetFileResourceScreen } from "../screens/assets/AssetFileResourceScreen";
import { AssetManagementScreen } from "../screens/assets/AssetManagementScreen";
import { AssetTechConfigScreen } from "../screens/assets/AssetTechConfigScreen";
import { AssetSoftwareScreen } from "../screens/assets/AssetSoftwareScreen";
import { AssetImpactAnalysisScreen } from "../screens/assets/AssetImpactAnalysisScreen";
import { AssetHistoryScreen } from "../screens/assets/AssetHistoryScreen";
import { AssetReportScreen } from "../screens/assets/AssetReportScreen";
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
      <Stack.Screen name="AssetExplorer" component={AssetExplorerScreen} options={{ title: "Asset Explorer" }} />
      <Stack.Screen name="AssetSubResource" component={AssetSubResourceScreen} options={({ route }) => ({ title: { components: "Components", volumes: "Volumes", connections: "Connections", "network-ports": "Network Ports", sockets: "Sockets" }[route.params.kind] })} />
      <Stack.Screen name="AssetFileResource" component={AssetFileResourceScreen} options={({ route }) => ({ title: route.params.kind === "contracts" ? "Contracts" : "Documents" })} />
      <Stack.Screen name="AssetManagement" component={AssetManagementScreen} options={{ title: "Management & Financials" }} />
      <Stack.Screen name="AssetTechConfig" component={AssetTechConfigScreen} options={{ title: "Technical Configuration" }} />
      <Stack.Screen name="AssetSoftware" component={AssetSoftwareScreen} options={{ title: "Software" }} />
      <Stack.Screen name="AssetImpactAnalysis" component={AssetImpactAnalysisScreen} options={{ title: "Impact Analysis" }} />
      <Stack.Screen name="AssetHistory" component={AssetHistoryScreen} options={{ title: "Location & History" }} />
      <Stack.Screen name="AssetReport" component={AssetReportScreen} options={{ title: "Asset Report" }} />
    </Stack.Navigator>
  );
}
