import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { TicketListScreen } from "../screens/helpdesk/TicketListScreen";
import { TicketDetailScreen } from "../screens/helpdesk/TicketDetailScreen";
import { TicketFormScreen } from "../screens/helpdesk/TicketFormScreen";
import { AppHeader } from "../components/AppHeader";
import { useTheme } from "../theme/ThemeContext";
import { HelpdeskStackParamList } from "./types";

const Stack = createNativeStackNavigator<HelpdeskStackParamList>();

export function HelpdeskStack() {
  const { colors } = useTheme();
  return (
    <Stack.Navigator screenOptions={{ headerStyle: { backgroundColor: colors.surface }, headerTintColor: colors.text, headerShadowVisible: false }}>
      <Stack.Screen name="TicketList" component={TicketListScreen} options={{ title: "Helpdesk & Ticketing", headerRight: () => <AppHeader /> }} />
      <Stack.Screen name="TicketDetail" component={TicketDetailScreen} options={{ title: "Ticket" }} />
      <Stack.Screen name="TicketForm" component={TicketFormScreen} options={{ title: "New Ticket" }} />
    </Stack.Navigator>
  );
}
