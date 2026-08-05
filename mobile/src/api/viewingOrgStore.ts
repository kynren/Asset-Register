import AsyncStorage from "@react-native-async-storage/async-storage";

// Mirrors client/src/api/viewingOrgStore.ts — remembers which organization a System Admin was
// last viewing across app restarts and access-token refreshes (~15 min JWT lifetime). AsyncStorage
// is async unlike localStorage, so an in-memory mirror is kept for the synchronous getter every
// axios request needs; `hydrate()` must run once at app startup before the first request fires.
const KEY = "kynren:viewingOrgId";

let cached: number | null = null;

export async function hydrateViewingOrgId(): Promise<void> {
  const raw = await AsyncStorage.getItem(KEY);
  const parsed = raw ? Number(raw) : NaN;
  cached = Number.isFinite(parsed) ? parsed : null;
}

export function getViewingOrgId(): number | null {
  return cached;
}

export function setViewingOrgId(id: number | null) {
  cached = id;
  if (id === null) AsyncStorage.removeItem(KEY);
  else AsyncStorage.setItem(KEY, String(id));
}
