// Production backend — same multi-tenant API the web client talks to. There is no dev/staging
// split configured on the server side yet, so this is the single source of truth for API_BASE_URL.
export const API_ORIGIN = "https://app-assets.kynren.com";
export const API_BASE_URL = `${API_ORIGIN}/api`;
