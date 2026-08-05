import axios from "axios";
import { API_BASE_URL } from "../config/env";
import { getAccessToken, notifyUnauthorized, setAccessToken } from "./tokenStore";
import { getViewingOrgId } from "./viewingOrgStore";

// Mirrors client/src/api/axiosClient.ts's Bearer-token + 401-refresh interceptor pair exactly, so
// every screen/hook ported from the web app can reuse the same request shape. The refresh session
// itself is an httpOnly cookie (see server/src/modules/auth/auth.controller.ts) — React Native's
// networking layer (NSURLSession on iOS, OkHttp on Android) maintains a native cookie jar per host
// the same way a browser does, so `withCredentials: true` here is what makes that cookie round-trip
// automatically on every request to API_BASE_URL, exactly as it does for the web client.
export const axiosClient = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
});

axiosClient.interceptors.request.use((config) => {
  const token = getAccessToken();
  if (token) {
    config.headers = config.headers ?? {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

let refreshPromise: Promise<string | null> | null = null;

async function tryRefresh(): Promise<string | null> {
  if (!refreshPromise) {
    refreshPromise = axios
      .post(`${API_BASE_URL}/auth/refresh`, { viewingOrganizationId: getViewingOrgId() }, { withCredentials: true })
      .then((res) => {
        const token = res.data.accessToken as string;
        setAccessToken(token);
        return token;
      })
      .catch(() => null)
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

axiosClient.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;
    if (error.response?.status === 401 && !original._retry && !original.url?.includes("/auth/")) {
      original._retry = true;
      const token = await tryRefresh();
      if (token) {
        original.headers.Authorization = `Bearer ${token}`;
        return axiosClient(original);
      }
      notifyUnauthorized();
    }
    return Promise.reject(error);
  }
);
