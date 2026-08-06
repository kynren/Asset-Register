import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { HomeStack } from "./HomeStack";
import { AssetsStack } from "./AssetsStack";
import { StockStack } from "./StockStack";
import { HelpdeskStack } from "./HelpdeskStack";
import { MoreStack } from "./MoreStack";
import { CustomTabBar } from "./CustomTabBar";
import { MainTabParamList } from "./types";

const Tab = createBottomTabNavigator<MainTabParamList>();

export function MainTabs() {
  return (
    <Tab.Navigator screenOptions={{ headerShown: false }} tabBar={(props) => <CustomTabBar {...props} />}>
      <Tab.Screen name="HomeTab" component={HomeStack} options={{ title: "Home" }} />
      <Tab.Screen name="AssetsTab" component={AssetsStack} options={{ title: "Assets" }} />
      <Tab.Screen name="StockTab" component={StockStack} options={{ title: "Stock" }} />
      <Tab.Screen name="HelpdeskTab" component={HelpdeskStack} options={{ title: "Helpdesk" }} />
      <Tab.Screen name="MoreTab" component={MoreStack} options={{ title: "More" }} />
    </Tab.Navigator>
  );
}
