// A module-level (not component-level) singleton holding the ICMP Pinger's live state. Kept
// outside React on purpose: PingConsoleTab used to own this fetch/reader loop itself and abort it
// in an unmount cleanup effect, which meant navigating to a different screen mid-ping (or mid
// continuous-ping) silently killed it. Moving the loop here means unmounting the tab just stops
// rendering it — the fetch keeps streaming and `lines` keeps accumulating — and remounting
// (navigating back) picks the same session back up via useSyncExternalStore.
export interface ConsoleLine {
  id: number;
  kind: "reply" | "timeout" | "error" | "info";
  text: string;
}

export interface PingSessionState {
  host: string;
  count: number | "continuous";
  running: boolean;
  lines: ConsoleLine[];
}

let state: PingSessionState = { host: "", count: 4, running: false, lines: [] };
let controller: AbortController | null = null;
let lineIdCounter = 0;
const listeners = new Set<() => void>();

function setState(partial: Partial<PingSessionState>) {
  state = { ...state, ...partial };
  listeners.forEach((listener) => listener());
}

export function subscribePingSession(callback: () => void) {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

export function getPingSessionSnapshot(): PingSessionState {
  return state;
}

function appendLine(kind: ConsoleLine["kind"], text: string) {
  lineIdCounter += 1;
  setState({ lines: [...state.lines.slice(-200), { id: lineIdCounter, kind, text }] });
}

export function setPingHost(host: string) {
  if (!state.running) setState({ host });
}

export function setPingCount(count: number | "continuous") {
  if (!state.running) setState({ count });
}

// Only ever applies a value the user hasn't already overridden (saved preference, then a
// fall-through to the browser's observed IP) — the sentinel is an empty host, same idea as the
// `defaultHostSet` ref this replaced, just living at module scope so it only fires once per tab
// session rather than once per component mount.
export function hydratePingHostIfEmpty(host: string) {
  if (!state.host && host) setState({ host });
}

export async function startPingSession(host: string, count: number | "continuous", authToken: string | null) {
  if (!host.trim()) return;
  controller?.abort();
  const ac = new AbortController();
  controller = ac;

  setState({ host, count, running: true, lines: [] });
  appendLine("info", `Pinging ${host} ${count === "continuous" ? "continuously" : `with ${count} packet(s)`}...`);

  try {
    const url = `/api/network/ping-stream?host=${encodeURIComponent(host.trim())}&count=${count}`;
    const res = await fetch(url, {
      headers: authToken ? { Authorization: `Bearer ${authToken}` } : undefined,
      signal: ac.signal,
    });

    if (!res.ok || !res.body) {
      const body = await res.json().catch(() => null);
      appendLine("error", body?.error ?? `Request failed (${res.status})`);
      setState({ running: false });
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split("\n\n");
      buffer = parts.pop() ?? "";

      for (const part of parts) {
        const dataLine = part.split("\n").find((l) => l.startsWith("data: "));
        if (!dataLine) continue;
        try {
          const evt = JSON.parse(dataLine.slice(6));
          if (evt.type === "reply") {
            appendLine("reply", `Reply from ${evt.host ?? host}: ${evt.bytes ? `bytes=${evt.bytes} ` : ""}time=${evt.timeMs}ms${evt.ttl ? ` TTL=${evt.ttl}` : ""}`);
          } else if (evt.type === "timeout") {
            appendLine("timeout", "Request timed out.");
          } else if (evt.type === "error") {
            appendLine("error", evt.raw);
          } else if (evt.type === "done") {
            appendLine("info", "Ping sequence complete.");
          }
        } catch {
          // ignore malformed chunk boundary
        }
      }
    }
  } catch (err: any) {
    if (err?.name !== "AbortError") appendLine("error", "Connection to ping stream lost.");
  } finally {
    setState({ running: false });
  }
}

export function stopPingSession() {
  controller?.abort();
  setState({ running: false });
  appendLine("info", "Stopped by user.");
}
