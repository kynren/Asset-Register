import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "./layout/AppShell";
import { ProtectedRoute } from "./auth/ProtectedRoute";
import { PermissionGate } from "./auth/PermissionGate";
import { LoginPage } from "./pages/auth/LoginPage";
import { ForceChangePasswordPage } from "./pages/auth/ForceChangePasswordPage";
import { DashboardPage } from "./pages/dashboard/DashboardPage";
import { AssetListPage } from "./pages/assets/AssetListPage";
import { AssetDetailPage } from "./pages/assets/AssetDetailPage";
import { NetworkMapPage } from "./pages/network/NetworkMapPage";
import { StockPage } from "./pages/stock/StockPage";
import { TicketListPage } from "./pages/helpdesk/TicketListPage";
import { TicketDetailPage } from "./pages/helpdesk/TicketDetailPage";
import { OperationsPage } from "./pages/operations/OperationsPage";
import { NvrPage } from "./pages/nvr/NvrPage";
import { AssistantPage } from "./pages/assistant/AssistantPage";
import { ProfilePage } from "./pages/profile/ProfilePage";
import { AdminPage } from "./pages/admin/AdminPage";
import { UserDetailPage } from "./pages/admin/UserDetailPage";
import { PasswordManagementPage } from "./pages/password/PasswordManagementPage";

function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      <Route element={<ProtectedRoute />}>
        <Route path="/force-change-password" element={<ForceChangePasswordPage />} />

        <Route element={<AppShell />}>
          <Route path="/" element={<PermissionGate module="dashboard" redirect><DashboardPage /></PermissionGate>} />

          <Route path="/assets" element={<PermissionGate module="assets" redirect><AssetListPage /></PermissionGate>} />
          <Route path="/assets/:id" element={<PermissionGate module="assets" redirect><AssetDetailPage /></PermissionGate>} />

          <Route path="/network" element={<PermissionGate module="network" redirect><NetworkMapPage /></PermissionGate>} />

          <Route path="/stock" element={<PermissionGate module="stock" redirect><StockPage /></PermissionGate>} />

          <Route path="/helpdesk" element={<PermissionGate module="helpdesk" redirect><TicketListPage /></PermissionGate>} />
          <Route path="/helpdesk/:id" element={<PermissionGate module="helpdesk" redirect><TicketDetailPage /></PermissionGate>} />

          <Route path="/operations" element={<PermissionGate module="operations" redirect><OperationsPage /></PermissionGate>} />

          <Route path="/nvr" element={<PermissionGate module="nvr" redirect><NvrPage /></PermissionGate>} />

          <Route path="/assistant" element={<PermissionGate module="virtual-assistant" redirect><AssistantPage /></PermissionGate>} />

          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/password" element={<PasswordManagementPage />} />
          <Route path="/admin" element={<PermissionGate module="admin" redirect><AdminPage /></PermissionGate>} />
          <Route path="/admin/users/:id" element={<PermissionGate module="admin" redirect><UserDetailPage /></PermissionGate>} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
