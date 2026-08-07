// Best-effort client for Paxton's Net2 Local Web API / Net2 Web API — unlike Hikvision's ISAPI
// (whose endpoints were verified against published, publicly-documented XML/HTTP spec), no real
// Net2 server or license was available to test this against while building it (see
// gates.service.ts's discovery notes and task #528's research). The endpoint shapes below follow
// the commonly-referenced session-token + resource-action pattern documented in Paxton's own
// integration guides, but have NOT been exercised against live hardware. If a real deployment's
// server answers with different paths, adjust `login()`/`setRelayState()` below to match — the
// rest of the Gates module (schema, CRUD, optimistic state) does not depend on these details.
export interface Net2CallResult {
  ok: boolean;
  message: string;
}

// Many on-prem Net2 servers run with a self-signed certificate on their local API port, which a
// plain fetch() will reject — surfaces as a clear "unable to verify certificate" message rather
// than a bypass, consistent with this client's unverified/best-effort status (see file header).
async function net2Fetch(url: string, init: RequestInit, timeoutMs = 8000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function login(ipAddress: string, port: number, clientId: string, username: string, password: string): Promise<{ ok: true; token: string } | { ok: false; message: string }> {
  const url = `https://${ipAddress}:${port}/api/session`;
  try {
    const res = await net2Fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId, username, password }),
    });
    if (!res.ok) return { ok: false, message: `Net2 login failed (HTTP ${res.status}).` };
    const body: any = await res.json().catch(() => ({}));
    const token = body?.token ?? body?.sessionId ?? body?.access_token;
    if (!token) return { ok: false, message: "Net2 login response did not include a session token." };
    return { ok: true, token };
  } catch (err: any) {
    return { ok: false, message: err?.name === "AbortError" ? "Net2 server did not respond (timed out)." : err?.message ?? "Could not reach the Net2 server." };
  }
}

// Momentarily unlocks (open) or re-locks (close) the relay wired to a gate's barrier/lock —
// mirrors the door-momentary-unlock action pattern Net2's own client software exposes per-door.
export async function setRelayState(
  ipAddress: string,
  port: number,
  clientId: string,
  username: string,
  password: string,
  relayNumber: number,
  action: "open" | "close"
): Promise<Net2CallResult> {
  const session = await login(ipAddress, port, clientId, username, password);
  if (!session.ok) return session;

  const url = `https://${ipAddress}:${port}/api/doors/${relayNumber}/${action === "open" ? "unlock" : "lock"}`;
  try {
    const res = await net2Fetch(url, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.token}` },
    });
    if (!res.ok) return { ok: false, message: `Net2 server rejected the ${action} command (HTTP ${res.status}).` };
    return { ok: true, message: `Gate ${action === "open" ? "opened" : "closed"}.` };
  } catch (err: any) {
    return { ok: false, message: err?.name === "AbortError" ? "Net2 server did not respond (timed out)." : err?.message ?? "Could not reach the Net2 server." };
  }
}
