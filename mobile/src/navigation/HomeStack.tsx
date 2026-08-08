import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { DashboardScreen } from "../screens/dashboard/DashboardScreen";
import { DashboardManagerScreen } from "../screens/dashboard/DashboardManagerScreen";
import { AppHeader } from "../components/AppHeader";
import { useTheme } from "../theme/ThemeContext";
import { HomeStackParamList } from "./types";

const Stack = createNativeStackNavigator<HomeStackParamList>();

export function HomeStack() {
  const { colors } = useTheme();
  return (
    <Stack.Navigator screenOptions={{ headerStyle: { backgroundColor: colors.surface }, headerTintColor: colors.text, headerShadowVisible: false }}>
      <Stack.Screen name="Dashboard" component={DashboardScreen} options={{ title: "Dashboard", headerRight: () => <AppHeader /> }} />
      <Stack.Screen name="DashboardManager" component={DashboardManagerScreen} options={{ title: "Dashboards" }} />
    </Stack.Navigator>
  );
}
