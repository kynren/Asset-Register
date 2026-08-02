import axios from "axios";
import { getAccessToken, notifyUnauthorized, setAccessToken } from "./tokenStore";
import { getViewingOrgId } from "./viewingOrgStore";

export const axiosClient = axios.create({
  baseURL: "/api",
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
      .post("/api/auth/refresh", { viewingOrganizationId: getViewingOrgId() }, { withCredentials: true })
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
