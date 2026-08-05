import { Ionicons } from "@expo/vector-icons";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { HomeStack } from "./HomeStack";
import { AssetsStack } from "./AssetsStack";
import { StockStack } from "./StockStack";
import { HelpdeskStack } from "./HelpdeskStack";
import { MoreStack } from "./MoreStack";
import { ComingSoonScreen } from "../screens/ComingSoonScreen";
import { useTheme } from "../theme/ThemeContext";
import { MainTabParamList } from "./types";

const Tab = createBottomTabNavigator<MainTabParamList>();

const ICONS: Record<keyof MainTabParamList, keyof typeof Ionicons.glyphMap> = {
  HomeTab: "home",
  AssetsTab: "cube",
  StockTab: "layers",
  HelpdeskTab: "help-buoy",
  MoreTab: "grid",
};

export function MainTabs() {
  const { colors } = useTheme();
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border },
        tabBarIcon: ({ color, size }) => <Ionicons name={ICONS[route.name as keyof MainTabParamList]} size={size} color={color} />,
      })}
    >
      <Tab.Screen name="AssetsTab" component={AssetsStack} options={{ title: "Assets" }} />
      <Tab.Screen name="StockTab" component={StockStack} options={{ title: "Stock" }} />
      <Tab.Screen name="HomeTab" component={HomeStack} options={{ title: "Home" }} />
      <Tab.Screen name="HelpdeskTab" component={HelpdeskStack} options={{ title: "Helpdesk" }} />
      <Tab.Screen name="MoreTab" component={MoreStack} options={{ title: "More" }} />
    </Tab.Navigator>
  );
}
