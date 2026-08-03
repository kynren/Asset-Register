import { createContext, ReactNode, useContext, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { axiosClient } from "../api/axiosClient";
import { applyAccentColor } from "../lib/color";
import { DEFAULT_LOGIN_DESIGN, LoginPageDesignConfig } from "../pages/appSettings/loginDesignTypes";

interface Branding {
  companyName: string;
  appIconUrl: string | null;
  faviconUrl: string | null;
  brandPrimaryColor: string | null;
  brandSecondaryColor: string | null;
  loginDesign: LoginPageDesignConfig;
}

const DEFAULT_BRANDING: Branding = {
  companyName: "Kynren Asset Register",
  appIconUrl: null,
  faviconUrl: null,
  brandPrimaryColor: null,
  brandSecondaryColor: null,
  loginDesign: DEFAULT_LOGIN_DESIGN,
};

const BrandingContext = createContext<Branding>(DEFAULT_BRANDING);

export function BrandingProvider({ children }: { children: ReactNode }) {
  const { data } = useQuery({
    queryKey: ["branding-public"],
    queryFn: async () => (await axiosClient.get("/settings/public")).data,
    staleTime: 0,
  });

  const { data: loginDesignData } = useQuery({
    queryKey: ["login-design-public"],
    queryFn: async () => (await axiosClient.get("/settings/public/login-design")).data as LoginPageDesignConfig,
    staleTime: 0,
  });

  const branding: Branding = {
    companyName: data?.companyName || DEFAULT_BRANDING.companyName,
    appIconUrl: data?.appIconUrl || null,
    faviconUrl: data?.faviconUrl || null,
    brandPrimaryColor: data?.brandPrimaryColor || null,
    brandSecondaryColor: data?.brandSecondaryColor || null,
    loginDesign: loginDesignData ?? DEFAULT_LOGIN_DESIGN,
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

  // Applied pre-auth too (this provider sits above AuthProvider) so the org's brand color shows
  // on the login page itself, not just after signing in. AuthContext re-applies this same value
  // once a user is known, layering their personal accentColor on top when set.
  useEffect(() => {
    applyAccentColor(branding.brandPrimaryColor);
  }, [branding.brandPrimaryColor]);

  return <BrandingContext.Provider value={branding}>{children}</BrandingContext.Provider>;
}

export function useBranding() {
  return useContext(BrandingContext);
}
