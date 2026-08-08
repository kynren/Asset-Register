import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { MoreScreen } from "../screens/more/MoreScreen";
import { AppHeader } from "../components/AppHeader";
import { ProfileScreen } from "../screens/profile/ProfileScreen";
import { NotificationPreferencesScreen } from "../screens/profile/NotificationPreferencesScreen";
import { AppearanceScreen } from "../screens/profile/AppearanceScreen";
import { OperationalContextScreen } from "../screens/more/OperationalContextScreen";
import { NetworkListScreen } from "../screens/network/NetworkListScreen";
import { NetworkGraphScreen } from "../screens/network/NetworkGraphScreen";
import { NetworkDeviceDetailScreen } from "../screens/network/NetworkDeviceDetailScreen";
import { PingConsoleScreen } from "../screens/network/PingConsoleScreen";
import { IpRangeScannerScreen } from "../screens/network/IpRangeScannerScreen";
import { SwitchingScreen } from "../screens/network/SwitchingScreen";
import { MonitorSettingsScreen } from "../screens/network/MonitorSettingsScreen";
import { OperationsHomeScreen } from "../screens/operations/OperationsHomeScreen";
import { ProjectListScreen } from "../screens/operations/ProjectListScreen";
import { ProjectDetailScreen } from "../screens/operations/ProjectDetailScreen";
import { ProjectFormScreen } from "../screens/operations/ProjectFormScreen";
import { KnowledgeListScreen } from "../screens/operations/KnowledgeListScreen";
import { KnowledgeDetailScreen } from "../screens/operations/KnowledgeDetailScreen";
import { BookingListScreen } from "../screens/operations/BookingListScreen";
import { BookingFormScreen } from "../screens/operations/BookingFormScreen";
import { RssFeedScreen } from "../screens/operations/RssFeedScreen";
import { SavedQueriesScreen } from "../screens/operations/SavedQueriesScreen";
import { ResourceSchedulingScreen } from "../screens/operations/ResourceSchedulingScreen";
import { ScheduleBlockFormScreen } from "../screens/operations/ScheduleBlockFormScreen";
import { LicenseListScreen } from "../screens/operations/LicenseListScreen";
import { LicenseDetailScreen } from "../screens/operations/LicenseDetailScreen";
import { TimelineScreen } from "../screens/operations/TimelineScreen";
import { LegacyToolsScreen } from "../screens/operations/LegacyToolsScreen";
import { ControlsHomeScreen } from "../screens/controls/ControlsHomeScreen";
import { LightingListScreen } from "../screens/controls/LightingListScreen";
import { LightingSiteMapListScreen } from "../screens/controls/LightingSiteMapListScreen";
import { LightingSiteMapViewScreen } from "../screens/controls/LightingSiteMapViewScreen";
import { GatesScreen } from "../screens/controls/GatesScreen";
import { DoorListScreen } from "../screens/controls/DoorListScreen";
import { DoorDetailScreen } from "../screens/controls/DoorDetailScreen";
import { NvrHomeScreen } from "../screens/nvr/NvrHomeScreen";
import { CameraListScreen } from "../screens/nvr/CameraListScreen";
import { CameraDetailScreen } from "../screens/nvr/CameraDetailScreen";
import { LiveCameraScreen } from "../screens/nvr/LiveCameraScreen";
import { LiveVideoMatrixScreen } from "../screens/nvr/LiveVideoMatrixScreen";
import { PlaybackCenterScreen } from "../screens/nvr/PlaybackCenterScreen";
import { DocsListScreen } from "../screens/docs/DocsListScreen";
import { DocumentDetailScreen } from "../screens/docs/DocumentDetailScreen";
import { DocumentFormScreen } from "../screens/docs/DocumentFormScreen";
import { ImportDocsScreen } from "../screens/docs/ImportDocsScreen";
import { ManageAccessScreen } from "../screens/docs/ManageAccessScreen";
import { ReportListScreen } from "../screens/reports/ReportListScreen";
import { ReportViewScreen } from "../screens/reports/ReportViewScreen";
import { ReportBuilderScreen } from "../screens/reports/ReportBuilderScreen";
import { EmailReportScreen } from "../screens/reports/EmailReportScreen";
import { ShareReportScreen } from "../screens/reports/ShareReportScreen";
import { VaultListScreen } from "../screens/vault/VaultListScreen";
import { VaultDetailScreen } from "../screens/vault/VaultDetailScreen";
import { VaultFormScreen } from "../screens/vault/VaultFormScreen";
import { AssistantScreen } from "../screens/assistant/AssistantScreen";
import { AdminHomeScreen } from "../screens/admin/AdminHomeScreen";
import { AppSettingsHomeScreen } from "../screens/admin/AppSettingsHomeScreen";
import { UserListScreen } from "../screens/admin/UserListScreen";
import { UserDetailScreen } from "../screens/admin/UserDetailScreen";
import { UserFormScreen } from "../screens/admin/UserFormScreen";
import { RoleListScreen } from "../screens/admin/RoleListScreen";
import { RolePermissionsScreen } from "../screens/admin/RolePermissionsScreen";
import { SystemSettingsScreen } from "../screens/admin/SystemSettingsScreen";
import { MobileSplashSettingsScreen } from "../screens/admin/MobileSplashSettingsScreen";
import { EmailTemplateListScreen } from "../screens/admin/EmailTemplateListScreen";
import { AgentLogScreen } from "../screens/admin/AgentLogScreen";
import { SystemStatusScreen } from "../screens/admin/SystemStatusScreen";
import { ChangelogScreen } from "../screens/admin/ChangelogScreen";
import { ChangeManagementListScreen } from "../screens/admin/ChangeManagementListScreen";
import { TeamListScreen } from "../screens/admin/TeamListScreen";
import { CategoriesLocationsScreen } from "../screens/admin/CategoriesLocationsScreen";
import { HelpdeskConfigScreen } from "../screens/admin/HelpdeskConfigScreen";
import { AutomationRulesScreen } from "../screens/admin/AutomationRulesScreen";
import { BrandingScreen } from "../screens/admin/BrandingScreen";
import { AuditLogScreen } from "../screens/admin/AuditLogScreen";
import { ToastSettingsScreen } from "../screens/admin/ToastSettingsScreen";
import { EmailIngestSettingsScreen } from "../screens/admin/EmailIngestSettingsScreen";
import { McpKeyListScreen } from "../screens/admin/McpKeyListScreen";
import { ExternalConnectorListScreen } from "../screens/admin/ExternalConnectorListScreen";
import { BackupsScreen } from "../screens/admin/BackupsScreen";
import { BackupDestinationFormScreen } from "../screens/admin/BackupDestinationFormScreen";
import { DatabaseTableListScreen } from "../screens/admin/DatabaseTableListScreen";
import { DatabaseRowListScreen } from "../screens/admin/DatabaseRowListScreen";
import { DatabaseRowFormScreen } from "../screens/admin/DatabaseRowFormScreen";
import { DatabaseRelationshipsScreen } from "../screens/admin/DatabaseRelationshipsScreen";
import { MediaCenterHomeScreen } from "../screens/admin/MediaCenterHomeScreen";
import { OrganizationListScreen } from "../screens/admin/OrganizationListScreen";
import { OrganizationFormScreen } from "../screens/admin/OrganizationFormScreen";
import { SwitchOrganizationScreen } from "../screens/admin/SwitchOrganizationScreen";
import { ComingSoonScreen } from "../screens/ComingSoonScreen";
import { useTheme } from "../theme/ThemeContext";
import { MoreStackParamList } from "./types";

const Stack = createNativeStackNavigator<MoreStackParamList>();

export function MoreStack() {
  const { colors } = useTheme();
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.surface },
        headerTintColor: colors.text,
        headerShadowVisible: false,
      }}
    >
      <Stack.Screen name="MoreRoot" component={MoreScreen} options={{ title: "More", headerRight: () => <AppHeader /> }} />
      <Stack.Screen name="Profile" component={ProfileScreen} options={{ title: "Profile" }} />
      <Stack.Screen name="NotificationPreferences" component={NotificationPreferencesScreen} options={{ title: "Notification Preferences" }} />
      <Stack.Screen name="Appearance" component={AppearanceScreen} options={{ title: "Appearance" }} />
      <Stack.Screen name="OperationalContext" component={OperationalContextScreen} options={{ title: "Operational Context" }} />
      <Stack.Screen name="NetworkList" component={NetworkListScreen} options={{ title: "Network Topology Map" }} />
      <Stack.Screen name="NetworkGraph" component={NetworkGraphScreen} options={{ title: "Topology Graph" }} />
      <Stack.Screen name="NetworkDeviceDetail" component={NetworkDeviceDetailScreen} options={{ title: "Device" }} />
      <Stack.Screen name="PingConsole" component={PingConsoleScreen} options={{ title: "ICMP Pinger" }} />
      <Stack.Screen name="IpRangeScanner" component={IpRangeScannerScreen} options={{ title: "IP Range Scanner" }} />
      <Stack.Screen name="Switching" component={SwitchingScreen} options={{ title: "Switching" }} />
      <Stack.Screen name="MonitorSettings" component={MonitorSettingsScreen} options={{ title: "Monitor Settings" }} />
      <Stack.Screen name="OperationsHome" component={OperationsHomeScreen} options={{ title: "Operations Tools" }} />
      <Stack.Screen name="ProjectList" component={ProjectListScreen} options={{ title: "IT Projects" }} />
      <Stack.Screen name="ProjectDetail" component={ProjectDetailScreen} options={{ title: "Project" }} />
      <Stack.Screen name="ProjectForm" component={ProjectFormScreen} options={{ title: "New Project" }} />
      <Stack.Screen name="KnowledgeList" component={KnowledgeListScreen} options={{ title: "Knowledge Base" }} />
      <Stack.Screen name="KnowledgeDetail" component={KnowledgeDetailScreen} options={{ title: "Article" }} />
      <Stack.Screen name="BookingList" component={BookingListScreen} options={{ title: "Asset Bookings" }} />
      <Stack.Screen name="BookingForm" component={BookingFormScreen} options={{ title: "New Booking" }} />
      <Stack.Screen name="RssFeed" component={RssFeedScreen} options={{ title: "RSS Feed" }} />
      <Stack.Screen name="SavedQueries" component={SavedQueriesScreen} options={{ title: "Saved Queries" }} />
      <Stack.Screen name="ResourceScheduling" component={ResourceSchedulingScreen} options={{ title: "Resource Scheduling" }} />
      <Stack.Screen name="ScheduleBlockForm" component={ScheduleBlockFormScreen} options={{ title: "Schedule Block" }} />
      <Stack.Screen name="LicenseList" component={LicenseListScreen} options={{ title: "Licenses" }} />
      <Stack.Screen name="LicenseDetail" component={LicenseDetailScreen} options={{ title: "License" }} />
      <Stack.Screen name="Timeline" component={TimelineScreen} options={{ title: "Timeline" }} />
      <Stack.Screen name="LegacyTools" component={LegacyToolsScreen} options={{ title: "Legacy Tools" }} />
      <Stack.Screen name="ControlsHome" component={ControlsHomeScreen} options={{ title: "Controls" }} />
      <Stack.Screen name="LightingList" component={LightingListScreen} options={{ title: "Lighting" }} />
      <Stack.Screen name="LightingSiteMapList" component={LightingSiteMapListScreen} options={{ title: "Site Maps" }} />
      <Stack.Screen name="LightingSiteMapView" component={LightingSiteMapViewScreen} options={({ route }) => ({ title: route.params.name })} />
      <Stack.Screen name="Gates" component={GatesScreen} options={{ title: "Gates" }} />
      <Stack.Screen name="DoorList" component={DoorListScreen} options={{ title: "Access Control" }} />
      <Stack.Screen name="DoorDetail" component={DoorDetailScreen} options={{ title: "Door" }} />
      <Stack.Screen name="NvrHome" component={NvrHomeScreen} options={{ title: "NVR & Cameras" }} />
      <Stack.Screen name="CameraList" component={CameraListScreen} options={{ title: "Cameras" }} />
      <Stack.Screen name="CameraDetail" component={CameraDetailScreen} options={{ title: "Camera" }} />
      <Stack.Screen name="LiveCamera" component={LiveCameraScreen} options={{ title: "Live" }} />
      <Stack.Screen name="LiveVideoMatrix" component={LiveVideoMatrixScreen} options={{ title: "Live Video Matrix" }} />
      <Stack.Screen name="PlaybackCenter" component={PlaybackCenterScreen} options={{ title: "Playback Center" }} />
      <Stack.Screen name="DocsList" component={DocsListScreen} options={{ title: "Docs & SOPs" }} />
      <Stack.Screen name="DocumentDetail" component={DocumentDetailScreen} options={{ title: "Document" }} />
      <Stack.Screen name="DocumentForm" component={DocumentFormScreen} options={({ route }) => ({ title: route.params?.id ? "Edit Document" : "New Document" })} />
      <Stack.Screen name="ImportDocs" component={ImportDocsScreen} options={{ title: "Import PDF/Word" }} />
      <Stack.Screen name="ManageAccess" component={ManageAccessScreen} options={{ title: "Manage Access" }} />
      <Stack.Screen name="ReportList" component={ReportListScreen} options={{ title: "Reports" }} />
      <Stack.Screen name="ReportView" component={ReportViewScreen} options={{ title: "Report" }} />
      <Stack.Screen name="ReportBuilder" component={ReportBuilderScreen} options={({ route }) => ({ title: route.params?.reportId ? "Edit Report" : "New Report" })} />
      <Stack.Screen name="EmailReport" component={EmailReportScreen} options={{ title: "Email Report" }} />
      <Stack.Screen name="ShareReport" component={ShareReportScreen} options={{ title: "Share Report" }} />
      <Stack.Screen name="VaultList" component={VaultListScreen} options={{ title: "Password Management" }} />
      <Stack.Screen name="VaultDetail" component={VaultDetailScreen} options={{ title: "Vault Entry" }} />
      <Stack.Screen name="VaultForm" component={VaultFormScreen} options={{ title: "Vault Entry" }} />
      <Stack.Screen name="Assistant" component={AssistantScreen} options={{ title: "Virtual Assistant" }} />
      <Stack.Screen name="AdminHome" component={AdminHomeScreen} options={{ title: "Admin & Setup" }} />
      <Stack.Screen name="AppSettingsHome" component={AppSettingsHomeScreen} options={{ title: "App Settings" }} />
      <Stack.Screen name="UserList" component={UserListScreen} options={{ title: "Users" }} />
      <Stack.Screen name="UserDetail" component={UserDetailScreen} options={{ title: "User" }} />
      <Stack.Screen name="UserForm" component={UserFormScreen} options={{ title: "Invite User" }} />
      <Stack.Screen name="RoleList" component={RoleListScreen} options={{ title: "Roles & Permissions" }} />
      <Stack.Screen name="RolePermissions" component={RolePermissionsScreen} options={{ title: "Role" }} />
      <Stack.Screen name="SystemSettings" component={SystemSettingsScreen} options={{ title: "System Settings" }} />
      <Stack.Screen name="MobileSplashSettings" component={MobileSplashSettingsScreen} options={{ title: "App Loading Screen" }} />
      <Stack.Screen name="EmailTemplateList" component={EmailTemplateListScreen} options={{ title: "Email Templates" }} />
      <Stack.Screen name="AgentLog" component={AgentLogScreen} options={{ title: "Agent Log" }} />
      <Stack.Screen name="SystemStatus" component={SystemStatusScreen} options={{ title: "System Status" }} />
      <Stack.Screen name="Changelog" component={ChangelogScreen} options={{ title: "Changelog" }} />
      <Stack.Screen name="ChangeManagementList" component={ChangeManagementListScreen} options={{ title: "Change Management" }} />
      <Stack.Screen name="TeamList" component={TeamListScreen} options={{ title: "Teams" }} />
      <Stack.Screen name="CategoriesLocations" component={CategoriesLocationsScreen} options={{ title: "Categories & Locations" }} />
      <Stack.Screen name="HelpdeskConfig" component={HelpdeskConfigScreen} options={{ title: "Helpdesk Config" }} />
      <Stack.Screen name="AutomationRules" component={AutomationRulesScreen} options={{ title: "Automation Rules" }} />
      <Stack.Screen name="Branding" component={BrandingScreen} options={{ title: "Branding" }} />
      <Stack.Screen name="AuditLog" component={AuditLogScreen} options={{ title: "Audit Log" }} />
      <Stack.Screen name="ToastSettings" component={ToastSettingsScreen} options={{ title: "Toast Designer" }} />
      <Stack.Screen name="EmailIngestSettings" component={EmailIngestSettingsScreen} options={{ title: "Email Ingestion" }} />
      <Stack.Screen name="McpKeyList" component={McpKeyListScreen} options={{ title: "MCP Connections" }} />
      <Stack.Screen name="ExternalConnectorList" component={ExternalConnectorListScreen} options={{ title: "App Connector" }} />
      <Stack.Screen name="Backups" component={BackupsScreen} options={{ title: "Backups" }} />
      <Stack.Screen name="BackupDestinationForm" component={BackupDestinationFormScreen} options={({ route }) => ({ title: route.params?.id ? "Edit Destination" : "Add Destination" })} />
      <Stack.Screen name="DatabaseTableList" component={DatabaseTableListScreen} options={{ title: "Database Manager" }} />
      <Stack.Screen name="DatabaseRowList" component={DatabaseRowListScreen} options={{ title: "Table" }} />
      <Stack.Screen name="DatabaseRowForm" component={DatabaseRowFormScreen} options={{ title: "Record" }} />
      <Stack.Screen name="DatabaseRelationships" component={DatabaseRelationshipsScreen} options={{ title: "Relationships" }} />
      <Stack.Screen name="MediaCenter" component={MediaCenterHomeScreen} options={{ title: "Media Center" }} />
      <Stack.Screen name="OrganizationList" component={OrganizationListScreen} options={{ title: "Organizations" }} />
      <Stack.Screen name="OrganizationForm" component={OrganizationFormScreen} options={({ route }) => ({ title: route.params?.id ? "Edit Organization" : "Create Organization" })} />
      <Stack.Screen name="SwitchOrganization" component={SwitchOrganizationScreen} options={{ title: "Switch Organization", presentation: "modal" }} />
      <Stack.Screen name="ComingSoon" component={ComingSoonScreen} options={({ route }) => ({ title: (route.params as any)?.label ?? "" })} />
    </Stack.Navigator>
  );
}
