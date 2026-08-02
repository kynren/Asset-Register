import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from "react";
import { axiosClient } from "../api/axiosClient";
import { setAccessToken, setUnauthorizedHandler } from "../api/tokenStore";
import { applyAccentColor } from "../lib/color";
import { queryClient } from "../lib/queryClient";
import { ActionName, ModulePermission, ModuleName, PermissionMap } from "../lib/permissions";

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
  login: (email: string, password: string, mfaToken?: string) => Promise<{ mfaRequired: boolean }>;
  magicLogin: (token: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshSession: () => Promise<void>;
  hasPermission: (module: ModuleName, action: ActionName) => boolean;
  switchOrganization: (organizationId: number) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const actionKey: Record<ActionName, keyof ModulePermission> = {
  view: "canView",
  create: "canCreate",
  edit: "canEdit",
  delete: "canDelete",
  export: "canExport",
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [permissions, setPermissions] = useState<PermissionMap>({});
  const [organization, setOrganization] = useState<ViewingOrganization | null>(null);
  const [loading, setLoading] = useState(true);

  async function bootstrap() {
    try {
      const res = await axiosClient.post("/auth/refresh");
      setAccessToken(res.data.accessToken);
      setUser(res.data.user);
      setPermissions(res.data.permissions);
      setOrganization(res.data.organization ?? null);
    } catch {
      setAccessToken(null);
      setUser(null);
      setPermissions({});
      setOrganization(null);
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

  useEffect(() => {
    applyAccentColor(user?.accentColor ?? null);
  }, [user?.accentColor]);

  async function login(email: string, password: string, mfaToken?: string) {
    const res = await axiosClient.post("/auth/login", { email, password, mfaToken });
    if (res.data.mfaRequired) return { mfaRequired: true };
    setAccessToken(res.data.accessToken);
    setUser(res.data.user);
    setPermissions(res.data.permissions);
    setOrganization(res.data.organization ?? null);
    return { mfaRequired: false };
  }

  async function magicLogin(token: string) {
    const res = await axiosClient.post("/auth/magic-login", { token });
    setAccessToken(res.data.accessToken);
    setUser(res.data.user);
    setPermissions(res.data.permissions);
    setOrganization(res.data.organization ?? null);
  }

  async function logout() {
    await axiosClient.post("/auth/logout").catch(() => undefined);
    setAccessToken(null);
    setUser(null);
    setPermissions({});
    setOrganization(null);
  }

  async function refreshSession() {
    const res = await axiosClient.get("/auth/me");
    setUser(res.data.user);
    setPermissions(res.data.permissions);
    setOrganization(res.data.organization ?? null);
  }

  // System Admin only (enforced server-side too) — swaps the active access token for one scoped
  // to a different organization's schema while keeping the same identity. Deliberately does NOT
  // reload the page: a reload would re-run bootstrap()'s own POST /auth/refresh, which resolves
  // its schema from the (untouched, still home-org) refresh cookie and would silently clobber the
  // freshly switched access token right back to the previous organization. Clearing the query
  // cache instead is what actually gets every module off the previous organization's data — the
  // dozens of query keys are otherwise identical between organizations and would keep serving
  // stale results.
  async function switchOrganization(organizationId: number) {
    const res = await axiosClient.post(`/app-settings/organizations/${organizationId}/switch`);
    setAccessToken(res.data.accessToken);
    setPermissions(res.data.permissions);
    setOrganization(res.data.organization ?? null);
    await queryClient.cancelQueries();
    queryClient.clear();
  }

  function hasPermission(module: ModuleName, action: ActionName) {
    const perm = permissions[module];
    if (!perm) return false;
    return Boolean(perm[actionKey[action]]);
  }

  const value = useMemo(
    () => ({ user, permissions, organization, loading, login, magicLogin, logout, refreshSession, hasPermission, switchOrganization }),
    [user, permissions, organization, loading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
