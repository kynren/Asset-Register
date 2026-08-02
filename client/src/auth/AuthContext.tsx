import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from "react";
import { axiosClient } from "../api/axiosClient";
import { setAccessToken, setUnauthorizedHandler } from "../api/tokenStore";
import { applyAccentColor } from "../lib/color";
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

interface AuthContextValue {
  user: AuthUser | null;
  permissions: PermissionMap;
  loading: boolean;
  login: (email: string, password: string, mfaToken?: string) => Promise<{ mfaRequired: boolean }>;
  magicLogin: (token: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshSession: () => Promise<void>;
  hasPermission: (module: ModuleName, action: ActionName) => boolean;
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
  const [loading, setLoading] = useState(true);

  async function bootstrap() {
    try {
      const res = await axiosClient.post("/auth/refresh");
      setAccessToken(res.data.accessToken);
      setUser(res.data.user);
      setPermissions(res.data.permissions);
    } catch {
      setAccessToken(null);
      setUser(null);
      setPermissions({});
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
    return { mfaRequired: false };
  }

  async function magicLogin(token: string) {
    const res = await axiosClient.post("/auth/magic-login", { token });
    setAccessToken(res.data.accessToken);
    setUser(res.data.user);
    setPermissions(res.data.permissions);
  }

  async function logout() {
    await axiosClient.post("/auth/logout").catch(() => undefined);
    setAccessToken(null);
    setUser(null);
    setPermissions({});
  }

  async function refreshSession() {
    const res = await axiosClient.get("/auth/me");
    setUser(res.data.user);
    setPermissions(res.data.permissions);
  }

  function hasPermission(module: ModuleName, action: ActionName) {
    const perm = permissions[module];
    if (!perm) return false;
    return Boolean(perm[actionKey[action]]);
  }

  const value = useMemo(
    () => ({ user, permissions, loading, login, magicLogin, logout, refreshSession, hasPermission }),
    [user, permissions, loading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
