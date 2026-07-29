import { useEffect, useRef, useState } from "react";
import Hls from "hls.js";
import { axiosClient } from "../../api/axiosClient";
import { getAccessToken } from "../../api/tokenStore";
import { Icon } from "../../components/Icon";

type FeedStatus = "idle" | "starting" | "ready" | "reconnecting" | "failed";

const HEALTH_POLL_MS = 5000;
const RECONNECT_DELAY_MS = 2000;

function RtspPreview({ streamUrl }: { streamUrl: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const pollRef = useRef<number | null>(null);
  const timeoutRef = useRef<number | null>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const userStoppedRef = useRef(false);
  const [status, setStatus] = useState<FeedStatus>("idle");
  const [error, setError] = useState<string | null>(null);

  function clearTimers() {
    if (pollRef.current) window.clearInterval(pollRef.current);
    if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
    if (reconnectTimeoutRef.current) window.clearTimeout(reconnectTimeoutRef.current);
    pollRef.current = null;
    timeoutRef.current = null;
    reconnectTimeoutRef.current = null;
  }

  function teardownSession() {
    hlsRef.current?.destroy();
    hlsRef.current = null;
    if (sessionIdRef.current) {
      const id = sessionIdRef.current;
      sessionIdRef.current = null;
      axiosClient.delete(`/nvr/stream/sessions/${id}`).catch(() => undefined);
    }
  }

  function stop() {
    userStoppedRef.current = true;
    clearTimers();
    teardownSession();
    setStatus("idle");
    setError(null);
  }

  // Called when a live session drops (ffmpeg died, camera dropped, unrecoverable hls.js
  // error) while the viewer hasn't asked to stop — tears down and reconnects automatically
  // so the feed is continuous rather than freezing on the last frame.
  function reconnect(reason: string) {
    if (userStoppedRef.current) return;
    clearTimers();
    teardownSession();
    setStatus("reconnecting");
    setError(reason);
    reconnectTimeoutRef.current = window.setTimeout(() => start(), RECONNECT_DELAY_MS);
  }

  function startHealthPoll(sessionId: string) {
    pollRef.current = window.setInterval(async () => {
      try {
        const res = await axiosClient.get(`/nvr/stream/sessions/${sessionId}/status`);
        if (res.data.status === "failed" || res.data.status === "not_found") {
          reconnect(res.data.error ?? "Live feed connection was lost.");
        }
      } catch {
        // transient — a single missed health check isn't worth reconnecting over
      }
    }, HEALTH_POLL_MS);
  }

  async function start() {
    userStoppedRef.current = false;
    setError(null);
    setStatus((prev) => (prev === "reconnecting" ? prev : "starting"));
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
                // hls.js issues its own XHRs for the playlist/segments, bypassing axiosClient's
                // auth interceptor — attach the bearer token directly or every request 401s.
                const hls = new Hls({
                  xhrSetup: (xhr) => {
                    const token = getAccessToken();
                    if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);
                  },
                });
                hls.on(Hls.Events.ERROR, (_event, data) => {
                  if (!data.fatal) return;
                  switch (data.type) {
                    case Hls.ErrorTypes.NETWORK_ERROR:
                      hls.startLoad();
                      break;
                    case Hls.ErrorTypes.MEDIA_ERROR:
                      hls.recoverMediaError();
                      break;
                    default:
                      reconnect("Live feed playback error — reconnecting.");
                  }
                });
                hls.loadSource(playlistUrl);
                hls.attachMedia(video);
                hlsRef.current = hls;
              } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
                video.src = playlistUrl;
              }
              video.play().catch(() => undefined);
            }
            // Keep checking on a slower cadence for as long as the feed is up, so a dropped
            // ffmpeg process or camera disconnect gets detected and reconnected automatically
            // instead of leaving the viewer stuck on a frozen frame.
            startHealthPoll(sessionId);
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

  const isLive = status === "ready";
  const isBusy = status === "starting" || status === "ready" || status === "reconnecting";

  return (
    <>
      <div className="row gap-2" style={{ marginBottom: 8 }}>
        {isBusy ? (
          <button className="btn btn-secondary" type="button" onClick={stop}>
            <Icon name="close" size={13} /> {status === "starting" ? "Cancel" : "Stop Preview"}
          </button>
        ) : (
          <button className="btn btn-secondary" type="button" onClick={start}>
            <Icon name="camera" size={13} /> Connect &amp; Preview
          </button>
        )}
        {status === "starting" && <span className="muted" style={{ fontSize: 12 }}>Connecting to stream...</span>}
        {status === "reconnecting" && <span className="muted" style={{ fontSize: 12 }}>Reconnecting...</span>}
        {status === "ready" && <span className="muted" style={{ fontSize: 12 }}>Live</span>}
      </div>

      <div style={{ background: "#000", borderRadius: 8, aspectRatio: "16/9", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
        <video ref={videoRef} muted playsInline controls style={{ width: "100%", height: "100%", display: isLive ? "block" : "none" }} />
        {!isLive && (
          <span style={{ color: "#7b8497", fontSize: 12, padding: 12, textAlign: "center" }}>
            {status === "idle" && "No live preview started."}
            {status === "starting" && "Waiting for first video segment..."}
            {status === "reconnecting" && (error ?? "Reconnecting to live feed...")}
            {status === "failed" && (error ?? "Live feed unavailable.")}
          </span>
        )}
      </div>
    </>
  );
}

export function LiveFeedPreview({ streamUrl }: { streamUrl: string }) {
  const isRtsp = /^rtsps?:\/\//i.test(streamUrl.trim());

  return (
    <div className="field">
      <label>Live Feed</label>
      {isRtsp ? (
        <RtspPreview streamUrl={streamUrl} />
      ) : (
        <div className="alert alert-warning" style={{ margin: 0 }}>Enter an rtsp:// stream URL above to enable live preview.</div>
      )}
    </div>
  );
}
