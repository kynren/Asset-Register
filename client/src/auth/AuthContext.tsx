import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from "react";
import { axiosClient } from "../api/axiosClient";
import { setAccessToken, setUnauthorizedHandler } from "../api/tokenStore";
import { getViewingOrgId, setViewingOrgId } from "../api/viewingOrgStore";
import { applyAccentColor, applyAppearanceOverrides } from "../lib/color";
import { queryClient } from "../lib/queryClient";
import { useBranding } from "../theme/BrandingContext";
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
  pinEnabled: boolean;
}

export interface ViewingOrganization {
  id: number;
  name: string;
  schemaName: string;
}

// The user's currently-applied appearance (their own theme, or one shared with them) — see
// theme/AppearanceContext.tsx for how this gets turned into CSS vars, and pages/profile/AppearanceTab.tsx
// for where it's created/edited/shared.
export interface ActiveAppearanceTheme {
  id: number;
  name: string;
  navPosition: "sidebar" | "topbar";
  primaryColor: string;
  sidebarBgColor: string | null;
  sidebarTextColor: string | null;
  pageBgColor: string | null;
  isDark: boolean;
}

interface AuthContextValue {
  user: AuthUser | null;
  /** Team ids the current user belongs to — lets team-based record-access checks run client-side
   *  without a round trip per record (see components/AccessControl.tsx). */
  myTeamIds: number[];
  activeTheme: ActiveAppearanceTheme | null;
  /** Called by the Appearance tab after activate/deactivate so the new look applies immediately. */
  setActiveTheme: (theme: ActiveAppearanceTheme | null) => void;
  permissions: PermissionMap;
  organization: ViewingOrganization | null;
  loading: boolean;
  login: (email: string, credential: { password: string } | { pin: string }, mfaToken?: string) => Promise<{ mfaRequired: boolean }>;
  magicLogin: (token: string) => Promise<void>;
  acceptInvite: (token: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshSession: () => Promise<void>;
  hasPermission: (module: ModuleName, action: ActionName) => boolean;
  switchOrganization: (organizationId: number, credential: { password: string } | { pin: string }, rememberMinutes: number | null) => Promise<void>;
  /** Has the caller already re-verified their identity to switch into this org, within the remembered window? */
  isOrgSwitchConfirmed: (organizationId: number) => boolean;
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
  const branding = useBranding();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [myTeamIds, setMyTeamIds] = useState<number[]>([]);
  const [activeTheme, setActiveTheme] = useState<ActiveAppearanceTheme | null>(null);
  const [permissions, setPermissions] = useState<PermissionMap>({});
  const [organization, setOrganization] = useState<ViewingOrganization | null>(null);
  const [loading, setLoading] = useState(true);
  const [orgSwitchConfirmedOrgId, setOrgSwitchConfirmedOrgId] = useState<number | null>(null);
  const [orgSwitchConfirmedUntil, setOrgSwitchConfirmedUntil] = useState<string | null>(null);

  async function bootstrap() {
    try {
      // viewingOrganizationId survives a hard reload / new tab (localStorage) so a System Admin's
      // "viewing org X" choice doesn't quietly reset to home the moment the access token expires
      // and the app calls this on mount — see viewingOrgStore.ts and auth.controller.ts's refresh().
      const res = await axiosClient.post("/auth/refresh", { viewingOrganizationId: getViewingOrgId() });
      setAccessToken(res.data.accessToken);
      setUser(res.data.user);
      setMyTeamIds(res.data.myTeamIds ?? []);
      setActiveTheme(res.data.activeTheme ?? null);
      setPermissions(res.data.permissions);
      setOrganization(res.data.organization ?? null);
      setViewingOrgId(res.data.organization?.id ?? null);
      setOrgSwitchConfirmedOrgId(res.data.orgSwitchConfirmedOrgId ?? null);
      setOrgSwitchConfirmedUntil(res.data.orgSwitchConfirmedUntil ?? null);
    } catch {
      setAccessToken(null);
      setUser(null);
      setMyTeamIds([]);
      setActiveTheme(null);
      setPermissions({});
      setOrganization(null);
      setViewingOrgId(null);
      setOrgSwitchConfirmedOrgId(null);
      setOrgSwitchConfirmedUntil(null);
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
    // An active AppearanceTheme's primary color wins first, then the user's personal accent
    // color, then the org-wide brand primary color set in Branding, rather than clearing the CSS
    // var entirely.
    applyAccentColor(activeTheme?.primaryColor ?? user?.accentColor ?? branding.brandPrimaryColor ?? null);
    applyAppearanceOverrides(activeTheme);
  }, [activeTheme, user?.accentColor, branding.brandPrimaryColor]);

  async function login(email: string, credential: { password: string } | { pin: string }, mfaToken?: string) {
    const res = await axiosClient.post("/auth/login", { email, ...credential, mfaToken });
    if (res.data.mfaRequired) return { mfaRequired: true };
    setAccessToken(res.data.accessToken);
    setUser(res.data.user);
    setMyTeamIds(res.data.myTeamIds ?? []);
    setActiveTheme(res.data.activeTheme ?? null);
    setPermissions(res.data.permissions);
    setOrganization(res.data.organization ?? null);
    setViewingOrgId(res.data.organization?.id ?? null);
    setOrgSwitchConfirmedOrgId(null);
    setOrgSwitchConfirmedUntil(null);
    return { mfaRequired: false };
  }

  async function magicLogin(token: string) {
    const res = await axiosClient.post("/auth/magic-login", { token });
    setAccessToken(res.data.accessToken);
    setUser(res.data.user);
    setMyTeamIds(res.data.myTeamIds ?? []);
    setActiveTheme(res.data.activeTheme ?? null);
    setPermissions(res.data.permissions);
    setOrganization(res.data.organization ?? null);
    setViewingOrgId(res.data.organization?.id ?? null);
    setOrgSwitchConfirmedOrgId(null);
    setOrgSwitchConfirmedUntil(null);
  }

  async function acceptInvite(token: string, password: string) {
    const res = await axiosClient.post("/auth/accept-invite", { token, password });
    setAccessToken(res.data.accessToken);
    setUser(res.data.user);
    setMyTeamIds(res.data.myTeamIds ?? []);
    setActiveTheme(res.data.activeTheme ?? null);
    setPermissions(res.data.permissions);
    setOrganization(res.data.organization ?? null);
    setViewingOrgId(res.data.organization?.id ?? null);
    setOrgSwitchConfirmedOrgId(null);
    setOrgSwitchConfirmedUntil(null);
  }

  async function logout() {
    await axiosClient.post("/auth/logout").catch(() => undefined);
    setAccessToken(null);
    setUser(null);
    setMyTeamIds([]);
    setActiveTheme(null);
    setPermissions({});
    setOrganization(null);
    setViewingOrgId(null);
    setOrgSwitchConfirmedOrgId(null);
    setOrgSwitchConfirmedUntil(null);
  }

  async function refreshSession() {
    const res = await axiosClient.get("/auth/me");
    setUser(res.data.user);
    setMyTeamIds(res.data.myTeamIds ?? []);
    setActiveTheme(res.data.activeTheme ?? null);
    setPermissions(res.data.permissions);
    setOrganization(res.data.organization ?? null);
    setOrgSwitchConfirmedOrgId(res.data.orgSwitchConfirmedOrgId ?? null);
    setOrgSwitchConfirmedUntil(res.data.orgSwitchConfirmedUntil ?? null);
  }

  // System Admin only (enforced server-side too) — swaps the active access token for one scoped
  // to a different organization's schema while keeping the same identity. Deliberately does NOT
  // reload the page: clearing the query cache is what actually gets every module off the previous
  // organization's data — the dozens of query keys are otherwise identical between organizations
  // and would keep serving stale results. The choice itself persists indefinitely from here (see
  // viewingOrgStore.ts + auth.controller.ts's refresh()) — it only ever changes on the next
  // switch or on logout, never on its own from a token refresh.
  async function switchOrganization(organizationId: number, credential: { password: string } | { pin: string }, rememberMinutes: number | null) {
    const res = await axiosClient.post(`/app-settings/organizations/${organizationId}/switch`, { ...credential, rememberMinutes });
    setAccessToken(res.data.accessToken);
    setPermissions(res.data.permissions);
    setOrganization(res.data.organization ?? null);
    setViewingOrgId(res.data.organization?.id ?? null);
    setOrgSwitchConfirmedOrgId(res.data.orgSwitchConfirmedOrgId ?? null);
    setOrgSwitchConfirmedUntil(res.data.orgSwitchConfirmedUntil ?? null);
    await queryClient.cancelQueries();
    queryClient.clear();
  }

  function hasPermission(module: ModuleName, action: ActionName) {
    const perm = permissions[module];
    if (!perm) return false;
    return Boolean(perm[actionKey[action]]);
  }

  function isOrgSwitchConfirmed(organizationId: number) {
    if (orgSwitchConfirmedOrgId !== organizationId) return false;
    if (orgSwitchConfirmedUntil === null) return true;
    return new Date(orgSwitchConfirmedUntil).getTime() > Date.now();
  }

  const value = useMemo(
    () => ({ user, myTeamIds, activeTheme, setActiveTheme, permissions, organization, loading, login, magicLogin, logout, refreshSession, hasPermission, switchOrganization, isOrgSwitchConfirmed }),
    [user, myTeamIds, activeTheme, permissions, organization, loading, orgSwitchConfirmedOrgId, orgSwitchConfirmedUntil]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
