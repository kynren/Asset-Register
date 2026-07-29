import { useEffect, useRef, useState } from "react";
import Hls from "hls.js";
import { axiosClient } from "../../api/axiosClient";
import { Icon } from "../../components/Icon";

type FeedStatus = "idle" | "starting" | "ready" | "failed";

export function LiveFeedPreview({ streamUrl }: { streamUrl: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const pollRef = useRef<number | null>(null);
  const timeoutRef = useRef<number | null>(null);
  const [status, setStatus] = useState<FeedStatus>("idle");
  const [error, setError] = useState<string | null>(null);

  const isRtsp = /^rtsps?:\/\//i.test(streamUrl.trim());

  function clearTimers() {
    if (pollRef.current) window.clearInterval(pollRef.current);
    if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
    pollRef.current = null;
    timeoutRef.current = null;
  }

  function stop() {
    clearTimers();
    hlsRef.current?.destroy();
    hlsRef.current = null;
    if (sessionIdRef.current) {
      const id = sessionIdRef.current;
      sessionIdRef.current = null;
      axiosClient.delete(`/nvr/stream/sessions/${id}`).catch(() => undefined);
    }
    setStatus("idle");
    setError(null);
  }

  async function start() {
    setError(null);
    setStatus("starting");
    try {
      const res = await axiosClient.post("/nvr/stream/sessions", { streamUrl: streamUrl.trim() });
      const sessionId = res.data.sessionId as string;
      sessionIdRef.current = sessionId;

      timeoutRef.current = window.setTimeout(() => {
        clearTimers();
        setStatus("failed");
        setError("Live feed did not become ready within 20 seconds.");
      }, 20000);

      pollRef.current = window.setInterval(async () => {
        try {
          const statusRes = await axiosClient.get(`/nvr/stream/sessions/${sessionId}/status`);
          if (statusRes.data.status === "ready") {
            clearTimers();
            setStatus("ready");
            const playlistUrl = `/api/nvr/stream/sessions/${sessionId}/playlist.m3u8`;
            const video = videoRef.current;
            if (video) {
              if (Hls.isSupported()) {
                const hls = new Hls();
                hls.loadSource(playlistUrl);
                hls.attachMedia(video);
                hlsRef.current = hls;
              } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
                video.src = playlistUrl;
              }
              video.play().catch(() => undefined);
            }
          } else if (statusRes.data.status === "failed") {
            clearTimers();
            setStatus("failed");
            setError(statusRes.data.error ?? "Live feed failed to start.");
          }
        } catch {
          // transient — keep polling until the hard timeout above
        }
      }, 1500);
    } catch (err: any) {
      setStatus("failed");
      setError(err?.response?.data?.error ?? "Could not start a live feed session.");
    }
  }

  useEffect(() => () => stop(), []);

  return (
    <div className="field">
      <label>Live Feed</label>
      {!isRtsp ? (
        <div className="alert alert-warning" style={{ margin: 0 }}>Enter an rtsp:// stream URL above to enable live preview.</div>
      ) : (
        <>
          <div className="row gap-2" style={{ marginBottom: 8 }}>
            {status === "idle" || status === "failed" ? (
              <button className="btn btn-secondary" type="button" onClick={start}>
                <Icon name="camera" size={13} /> Connect &amp; Preview
              </button>
            ) : (
              <button className="btn btn-secondary" type="button" onClick={stop}>
                <Icon name="close" size={13} /> {status === "starting" ? "Cancel" : "Stop Preview"}
              </button>
            )}
            {status === "starting" && <span className="muted" style={{ fontSize: 12 }}>Connecting to stream...</span>}
          </div>

          <div style={{ background: "#000", borderRadius: 8, aspectRatio: "16/9", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
            <video ref={videoRef} muted playsInline controls style={{ width: "100%", height: "100%", display: status === "ready" ? "block" : "none" }} />
            {status !== "ready" && (
              <span style={{ color: "#7b8497", fontSize: 12, padding: 12, textAlign: "center" }}>
                {status === "idle" && "No live preview started."}
                {status === "starting" && "Waiting for first video segment..."}
                {status === "failed" && (error ?? "Live feed unavailable.")}
              </span>
            )}
          </div>
        </>
      )}
    </div>
  );
}
