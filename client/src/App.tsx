import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "./layout/AppShell";
import { ProtectedRoute } from "./auth/ProtectedRoute";
import { PermissionGate } from "./auth/PermissionGate";
import { LoginPage } from "./pages/auth/LoginPage";
import { ForgotPasswordPage } from "./pages/auth/ForgotPasswordPage";
import { ResetPasswordPage } from "./pages/auth/ResetPasswordPage";
import { MagicLoginPage } from "./pages/auth/MagicLoginPage";
import { ForceChangePasswordPage } from "./pages/auth/ForceChangePasswordPage";
import { DashboardPage } from "./pages/dashboard/DashboardPage";
import { AssetListPage } from "./pages/assets/AssetListPage";
import { AssetDetailPage } from "./pages/assets/AssetDetailPage";
import { HarnessInventoryPage } from "./pages/assets/HarnessInventoryPage";
import { HarnessDetailRoutePage } from "./pages/assets/HarnessDetailRoutePage";
import { NetworkMapPage } from "./pages/network/NetworkMapPage";
import { StockPage } from "./pages/stock/StockPage";
import { TicketListPage } from "./pages/helpdesk/TicketListPage";
import { TicketDetailPage } from "./pages/helpdesk/TicketDetailPage";
import { OperationsPage } from "./pages/operations/OperationsPage";
import { NvrPage } from "./pages/nvr/NvrPage";
import { AccessControlPage } from "./pages/accessControl/AccessControlPage";
import { LightingPage } from "./pages/lighting/LightingPage";
import { DocsListPage } from "./pages/docs/DocsListPage";
import { DocumentDetailPage } from "./pages/docs/DocumentDetailPage";
import { OperationalContextPage } from "./pages/operational/OperationalContextPage";
import { AssistantPage } from "./pages/assistant/AssistantPage";
import { ProfilePage } from "./pages/profile/ProfilePage";
import { AdminPage } from "./pages/admin/AdminPage";
import { UserDetailPage } from "./pages/admin/UserDetailPage";
import { AppSettingsPage } from "./pages/appSettings/AppSettingsPage";
import { PasswordManagementPage } from "./pages/password/PasswordManagementPage";

function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password/:token" element={<ResetPasswordPage />} />
      <Route path="/magic-login/:token" element={<MagicLoginPage />} />

      <Route element={<ProtectedRoute />}>
        <Route path="/force-change-password" element={<ForceChangePasswordPage />} />

        <Route element={<AppShell />}>
          <Route path="/" element={<PermissionGate module="dashboard" redirect><DashboardPage /></PermissionGate>} />

          <Route path="/assets" element={<PermissionGate module="assets" redirect><AssetListPage /></PermissionGate>} />
          <Route path="/assets/:id" element={<PermissionGate module="assets" redirect><AssetDetailPage /></PermissionGate>} />

          <Route path="/harness" element={<PermissionGate module="harness" redirect><HarnessInventoryPage /></PermissionGate>} />
          <Route path="/harness/:id" element={<PermissionGate module="harness" redirect><HarnessDetailRoutePage /></PermissionGate>} />

          <Route path="/network" element={<PermissionGate module="network" redirect><NetworkMapPage /></PermissionGate>} />

          <Route path="/stock" element={<PermissionGate module="stock" redirect><StockPage /></PermissionGate>} />

          <Route path="/helpdesk" element={<PermissionGate module="helpdesk" redirect><TicketListPage /></PermissionGate>} />
          <Route path="/helpdesk/:id" element={<PermissionGate module="helpdesk" redirect><TicketDetailPage /></PermissionGate>} />

          <Route path="/operations" element={<PermissionGate module="operations" redirect><OperationsPage /></PermissionGate>} />

          <Route path="/nvr" element={<PermissionGate module="nvr" redirect><NvrPage /></PermissionGate>} />
          <Route path="/access-control" element={<PermissionGate module="access-control" redirect><AccessControlPage /></PermissionGate>} />
          <Route path="/lighting" element={<PermissionGate module="lighting" redirect><LightingPage /></PermissionGate>} />

          <Route path="/docs" element={<PermissionGate module="docs" redirect><DocsListPage /></PermissionGate>} />
          <Route path="/docs/:id" element={<PermissionGate module="docs" redirect><DocumentDetailPage /></PermissionGate>} />

          <Route path="/operational-context" element={<PermissionGate module="assets" redirect><OperationalContextPage /></PermissionGate>} />

          <Route path="/assistant" element={<PermissionGate module="virtual-assistant" redirect><AssistantPage /></PermissionGate>} />

          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/password" element={<PermissionGate module="password" redirect><PasswordManagementPage /></PermissionGate>} />
          <Route path="/admin" element={<PermissionGate module="admin" redirect><AdminPage /></PermissionGate>} />
          <Route path="/admin/users/:id" element={<PermissionGate module="admin" redirect><UserDetailPage /></PermissionGate>} />
          <Route path="/app-settings" element={<PermissionGate module="app-settings" redirect><AppSettingsPage /></PermissionGate>} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
