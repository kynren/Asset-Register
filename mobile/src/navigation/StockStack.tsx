import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { StockListScreen } from "../screens/stock/StockListScreen";
import { StockDetailScreen } from "../screens/stock/StockDetailScreen";
import { StockFormScreen } from "../screens/stock/StockFormScreen";
import { StockScanScreen } from "../screens/stock/StockScanScreen";
import { StockAdjustScreen } from "../screens/stock/StockAdjustScreen";
import { AppHeader } from "../components/AppHeader";
import { useTheme } from "../theme/ThemeContext";
import { StockStackParamList } from "./types";

const Stack = createNativeStackNavigator<StockStackParamList>();

export function StockStack() {
  const { colors } = useTheme();
  return (
    <Stack.Navigator screenOptions={{ headerStyle: { backgroundColor: colors.surface }, headerTintColor: colors.text, headerShadowVisible: false }}>
      <Stack.Screen name="StockList" component={StockListScreen} options={{ title: "Stock Register", headerRight: () => <AppHeader /> }} />
      <Stack.Screen name="StockDetail" component={StockDetailScreen} options={{ title: "Stock Item" }} />
      <Stack.Screen name="StockForm" component={StockFormScreen} options={({ route }) => ({ title: route.params?.id ? "Edit Stock Item" : "New Stock Item" })} />
      <Stack.Screen name="StockScan" component={StockScanScreen} options={{ title: "Scan Stock", headerStyle: { backgroundColor: "#000" }, headerTintColor: "#fff" }} />
      <Stack.Screen name="StockAdjust" component={StockAdjustScreen} options={{ title: "Adjust Stock", presentation: "modal" }} />
    </Stack.Navigator>
  );
}
