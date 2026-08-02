// Remembers which organization a System Admin was last viewing, across page reloads and access
// token refreshes (~15 min JWT lifetime) — without it, every silent token refresh would fall back
// to the caller's home schema, undoing a switch a few minutes after it happened. Not itself a
// trust boundary: the server independently re-verifies the caller is really a System Admin (from
// the refresh-session-validated user row, not from this value) before honoring it, so a tampered
// localStorage value can at most name a different real organization, never grant access nobody
// already had.
const KEY = "kynren:viewingOrgId";

export function getViewingOrgId(): number | null {
  const raw = localStorage.getItem(KEY);
  const parsed = raw ? Number(raw) : NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

export function setViewingOrgId(id: number | null) {
  if (id === null) localStorage.removeItem(KEY);
  else localStorage.setItem(KEY, String(id));
}
