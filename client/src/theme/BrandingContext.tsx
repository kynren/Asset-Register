import { createContext, ReactNode, useContext, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { axiosClient } from "../api/axiosClient";

interface Branding {
  companyName: string;
  appIconUrl: string | null;
  faviconUrl: string | null;
}

const DEFAULT_BRANDING: Branding = { companyName: "Kynren Asset Register", appIconUrl: null, faviconUrl: null };

const BrandingContext = createContext<Branding>(DEFAULT_BRANDING);

export function BrandingProvider({ children }: { children: ReactNode }) {
  const { data } = useQuery({
    queryKey: ["branding-public"],
    queryFn: async () => (await axiosClient.get("/settings/public")).data,
    staleTime: 0,
  });

  const branding: Branding = {
    companyName: data?.companyName || DEFAULT_BRANDING.companyName,
    appIconUrl: data?.appIconUrl || null,
    faviconUrl: data?.faviconUrl || null,
  };

  useEffect(() => {
    if (branding.faviconUrl) {
      let link = document.querySelector<HTMLLinkElement>("link[rel~='icon']");
      if (!link) {
        link = document.createElement("link");
        link.rel = "icon";
        document.head.appendChild(link);
      }
      // Cache-bust so a re-uploaded favicon at a fresh filename is picked up immediately.
      link.href = branding.faviconUrl;
    }
    document.title = branding.companyName;
  }, [branding.faviconUrl, branding.companyName]);

  return <BrandingContext.Provider value={branding}>{children}</BrandingContext.Provider>;
}

export function useBranding() {
  return useContext(BrandingContext);
}
