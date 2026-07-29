import net from "net";

export interface ConnectionTestResult {
  reachable: boolean;
  latencyMs: number | null;
  protocolConfirmed: boolean;
  message: string;
}

/**
 * Real TCP-level reachability test against a device's IP:port. If the protocol is RTSP
 * (or the port is the standard RTSP port 554), also sends a real RTSP OPTIONS request and
 * checks for a valid "RTSP/1.0 <code>" response line to confirm the service itself is
 * speaking RTSP, not just that the port is open.
 */
export function testDeviceConnection(host: string, port: number, protocol?: string, timeoutMs = 4000): Promise<ConnectionTestResult> {
  const isRtsp = (protocol ?? "").toUpperCase() === "RTSP" || port === 554;

  return new Promise((resolve) => {
    const start = Date.now();
    const socket = new net.Socket();
    let settled = false;
    let buffer = "";

    const finish = (result: ConnectionTestResult) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(result);
    };

    socket.setTimeout(timeoutMs);

    socket.once("timeout", () => finish({ reachable: false, latencyMs: null, protocolConfirmed: false, message: `Connection to ${host}:${port} timed out.` }));
    socket.once("error", (err: NodeJS.ErrnoException) => {
      const reason = err.code === "ECONNREFUSED" ? "Connection refused" : err.code === "EHOSTUNREACH" ? "Host unreachable" : err.message;
      finish({ reachable: false, latencyMs: null, protocolConfirmed: false, message: `${reason} (${host}:${port}).` });
    });

    socket.connect(port, host, () => {
      const latencyMs = Date.now() - start;

      if (!isRtsp) {
        finish({ reachable: true, latencyMs, protocolConfirmed: false, message: `TCP port ${port} on ${host} is open (${latencyMs}ms).` });
        return;
      }

      socket.write(`OPTIONS rtsp://${host}:${port}/ RTSP/1.0\r\nCSeq: 1\r\n\r\n`);
      socket.once("data", (data) => {
        buffer += data.toString("utf8");
        const statusLine = buffer.split("\r\n")[0] ?? "";
        const rtspOk = /^RTSP\/1\.0 \d{3}/.test(statusLine);
        finish({
          reachable: true,
          latencyMs,
          protocolConfirmed: rtspOk,
          message: rtspOk
            ? `RTSP service responded on ${host}:${port} (${latencyMs}ms).`
            : `Port ${port} on ${host} is open, but did not respond like an RTSP service.`,
        });
      });
    });
  });
}
