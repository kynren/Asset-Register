import { useQuery } from "@tanstack/react-query";
import { axiosClient } from "../api/axiosClient";

export interface ClientInfo {
  observedIp: string;
  protocol: string;
  host: string;
  appVersion: string;
}

// Polls the server's view of this connection continuously (even while the tab is backgrounded)
// so a real network change — switching Wi-Fi, VPN toggling, DHCP renewal — is reflected within
// a few seconds instead of waiting on a stale cached value or a page reload.
export function useClientInfo() {
  return useQuery({
    queryKey: ["client-info"],
    queryFn: async () => (await axiosClient.get("/system/client-info")).data as ClientInfo,
    refetchInterval: 3000,
    refetchIntervalInBackground: true,
    staleTime: 0,
  });
}
