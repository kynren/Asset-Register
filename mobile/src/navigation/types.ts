export type HomeStackParamList = {
  Dashboard: undefined;
};

export type AssetsStackParamList = {
  AssetsList: undefined;
  AssetDetail: { id: number };
  AssetForm: { id?: number } | undefined;
  AssetScan: undefined;
};

export type StockStackParamList = {
  StockList: undefined;
  StockDetail: { id: number };
  StockForm: { id?: number } | undefined;
  StockScan: undefined;
  StockAdjust: { id: number };
  StockIssue: { id: number };
};

export type HelpdeskStackParamList = {
  TicketList: undefined;
  TicketDetail: { id: number };
  TicketForm: undefined;
};

export type MoreStackParamList = {
  MoreRoot: undefined;
  Profile: undefined;
  NotificationPreferences: undefined;
  OperationalContext: undefined;
  NetworkList: undefined;
  NetworkGraph: undefined;
  NetworkDeviceDetail: { id: number };
  OperationsHome: undefined;
  ProjectList: undefined;
  ProjectDetail: { id: number };
  ProjectForm: undefined;
  KnowledgeList: undefined;
  KnowledgeDetail: { id: number };
  BookingList: undefined;
  BookingForm: undefined;
  RssFeed: undefined;
  SavedQueries: undefined;
  ResourceScheduling: undefined;
  ScheduleBlockForm: { id?: number; defaultDate?: string } | undefined;
  LicenseList: undefined;
  LicenseDetail: { id: number };
  Timeline: undefined;
  LegacyTools: undefined;
  ControlsHome: undefined;
  LightingList: undefined;
  LightingSiteMapList: undefined;
  LightingSiteMapView: { id: number; name: string };
  Gates: undefined;
  DoorList: undefined;
  DoorDetail: { id: number };
  NvrHome: undefined;
  CameraList: undefined;
  CameraDetail: { id: number };
  LiveCamera: { id: number };
  LiveVideoMatrix: undefined;
  PlaybackCenter: undefined;
  DocsList: undefined;
  DocumentDetail: { id: number };
  DocumentForm: { id?: number } | undefined;
  ImportDocs: undefined;
  ManageAccess: { apiBasePath: string; queryKeyToInvalidate?: string; title?: string };
  ReportList: undefined;
  ReportView: { id: number };
  ReportBuilder: { reportId?: number; defaultSource?: string } | undefined;
  EmailReport: { id: number; name: string };
  ShareReport: { id: number };
  VaultList: undefined;
  VaultDetail: { id: number };
  VaultForm: { id?: number } | undefined;
  Assistant: undefined;
  AdminHome: undefined;
  AppSettingsHome: undefined;
  UserList: undefined;
  UserDetail: { id: number };
  UserForm: undefined;
  RoleList: undefined;
  RolePermissions: { id: number };
  SystemSettings: undefined;
  MobileSplashSettings: undefined;
  EmailTemplateList: undefined;
  AgentLog: undefined;
  SystemStatus: undefined;
  Changelog: undefined;
  ChangeManagementList: undefined;
  TeamList: undefined;
  CategoriesLocations: undefined;
  HelpdeskConfig: undefined;
  AutomationRules: undefined;
  Branding: undefined;
  AuditLog: undefined;
  ToastSettings: undefined;
  EmailIngestSettings: undefined;
  McpKeyList: undefined;
  ExternalConnectorList: undefined;
  Backups: undefined;
  BackupDestinationForm: { id?: number } | undefined;
  DatabaseTableList: undefined;
  DatabaseRowList: { model: string };
  DatabaseRowForm: { model: string; id?: string };
  DatabaseRelationships: undefined;
  MediaCenter: undefined;
  OrganizationList: undefined;
  OrganizationForm: { id?: number } | undefined;
  SwitchOrganization: { id: number; name: string };
  ComingSoon: { label?: string } | undefined;
};

export type MainTabParamList = {
  HomeTab: undefined;
  AssetsTab: { label?: string } | undefined;
  StockTab: { label?: string } | undefined;
  HelpdeskTab: { label?: string } | undefined;
  MoreTab: undefined;
};

// Wraps MainTabs so Notifications can be presented as a modal from anywhere, on top of whichever
// tab/screen the user is currently on, and dismiss back to exactly that screen — see
// navigationRef.ts for why this can't just be another screen inside MoreStack.
export type RootStackParamList = {
  MainTabs: undefined;
  Notifications: undefined;
};
