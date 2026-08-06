// Production backend — same multi-tenant API the web client talks to. In a __DEV__ build running
// in a browser (Expo web preview), point at the local dev server instead so testing never touches
// production data. Native dev builds on a device/simulator still need a LAN IP, not localhost, so
// this only kicks in when `window` exists (i.e. the web target).
const isDevWeb = __DEV__ && typeof window !== "undefined";
export const API_ORIGIN = isDevWeb ? "http://localhost:4000" : "https://app-assets.kynren.com";
export const API_BASE_URL = `${API_ORIGIN}/api`;
