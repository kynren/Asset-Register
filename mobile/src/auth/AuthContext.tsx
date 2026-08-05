import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from "react";
import { axiosClient } from "../api/axiosClient";
import { setAccessToken, setUnauthorizedHandler } from "../api/tokenStore";
import { getViewingOrgId, hydrateViewingOrgId, setViewingOrgId } from "../api/viewingOrgStore";
import { queryClient } from "../lib/queryClient";
import { ActionName, ModuleName, ModulePermission, PermissionMap } from "../lib/permissions";
import { registerForPushNotifications, unregisterPushToken } from "../lib/pushNotifications";

// Mirrors client/src/auth/AuthContext.tsx's login/refresh/logout flow against the same
// /api/auth/* endpoints. Deliberately drops the web-only AppearanceTheme/Branding/org-switch-UI
// concerns (no on-device equivalent yet) — user, permissions, and organization are the load-bearing
// pieces every module screen needs.
export interface AuthUser {
  id: number;
  email: string;
  firstName: string;
  lastName: string;
  avatarUrl: string | null;
  accentColor: string | null;
  roleId: number;
  roleName: string;
  mustChangePassword: boolean;
  lastLoginAt: string | null;
  mfaEnabled: boolean;
  pinEnabled: boolean;
}

export interface ViewingOrganization {
  id: number;
  name: string;
  schemaName: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  permissions: PermissionMap;
  organization: ViewingOrganization | null;
  loading: boolean;
  login: (email: string, credential: { password: string } | { pin: string }, mfaToken?: string) => Promise<{ mfaRequired: boolean }>;
  logout: () => Promise<void>;
  refreshSession: () => Promise<void>;
  hasPermission: (module: ModuleName, action: ActionName) => boolean;
  switchOrganization: (organizationId: number, credential: { password: string } | { pin: string }) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const actionKey: Record<ActionName, keyof ModulePermission> = {
  view: "canView",
  create: "canCreate",
  edit: "canEdit",
  delete: "canDelete",
  export: "canExport",
  import: "canImport",
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [permissions, setPermissions] = useState<PermissionMap>({});
  const [organization, setOrganization] = useState<ViewingOrganization | null>(null);
  const [loading, setLoading] = useState(true);

  async function bootstrap() {
    try {
      await hydrateViewingOrgId();
      const res = await axiosClient.post("/auth/refresh", { viewingOrganizationId: getViewingOrgId() });
      setAccessToken(res.data.accessToken);
      setUser(res.data.user);
      setPermissions(res.data.permissions);
      setOrganization(res.data.organization ?? null);
      setViewingOrgId(res.data.organization?.id ?? null);
      void registerForPushNotifications();
    } catch {
      setAccessToken(null);
      setUser(null);
      setPermissions({});
      setOrganization(null);
      setViewingOrgId(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setUnauthorizedHandler(() => {
      setUser(null);
      setPermissions({});
    });
    bootstrap();
    return () => setUnauthorizedHandler(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function login(email: string, credential: { password: string } | { pin: string }, mfaToken?: string) {
    const res = await axiosClient.post("/auth/login", { email, ...credential, mfaToken });
    if (res.data.mfaRequired) return { mfaRequired: true };
    setAccessToken(res.data.accessToken);
    setUser(res.data.user);
    setPermissions(res.data.permissions);
    setOrganization(res.data.organization ?? null);
    setViewingOrgId(res.data.organization?.id ?? null);
    void registerForPushNotifications();
    return { mfaRequired: false };
  }

  async function logout() {
    await unregisterPushToken();
    await axiosClient.post("/auth/logout").catch(() => undefined);
    setAccessToken(null);
    setUser(null);
    setPermissions({});
    setOrganization(null);
    setViewingOrgId(null);
    queryClient.clear();
  }

  async function refreshSession() {
    const res = await axiosClient.get("/auth/me");
    setUser(res.data.user);
    setPermissions(res.data.permissions);
    setOrganization(res.data.organization ?? null);
  }

  function hasPermission(module: ModuleName, action: ActionName) {
    const perm = permissions[module];
    if (!perm) return false;
    return Boolean(perm[actionKey[action]]);
  }

  // Mirrors client/src/auth/AuthContext.tsx's switchOrganization, minus the "remembered window"
  // bookkeeping (orgSwitchConfirmedOrgId/Until) — no on-device equivalent UI reads that yet, so
  // mobile just re-verifies the credential on every switch instead of skipping it within a window.
  async function switchOrganization(organizationId: number, credential: { password: string } | { pin: string }) {
    const res = await axiosClient.post(`/app-settings/organizations/${organizationId}/switch`, { ...credential, rememberMinutes: null });
    setAccessToken(res.data.accessToken);
    setPermissions(res.data.permissions);
    setOrganization(res.data.organization ?? null);
    setViewingOrgId(res.data.organization?.id ?? null);
    queryClient.clear();
  }

  const value = useMemo(
    () => ({ user, permissions, organization, loading, login, logout, refreshSession, hasPermission, switchOrganization }),
    [user, permissions, organization, loading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
