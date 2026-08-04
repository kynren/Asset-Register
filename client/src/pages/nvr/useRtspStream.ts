import { RefObject, useEffect, useRef, useState } from "react";
import Hls from "hls.js";
import { axiosClient } from "../../api/axiosClient";
import { getAccessToken } from "../../api/tokenStore";

export type FeedStatus = "idle" | "starting" | "ready" | "reconnecting" | "failed";

const HEALTH_POLL_MS = 5000;
const RECONNECT_DELAY_MS = 2000;

/**
 * Drives one real ffmpeg RTSP→HLS relay session against a <video> element: starts the
 * session, waits for the first segment, attaches hls.js (with the app's bearer token, since
 * hls.js issues its own XHRs bypassing axiosClient's interceptor), and keeps a background
 * health check running so a dropped stream reconnects automatically instead of freezing.
 * Shared by the single-camera live feed modal and the multi-camera video matrix tiles.
 */
export function useRtspStream(streamUrl: string, videoRef: RefObject<HTMLVideoElement | null>, cameraId?: number) {
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
      const res = await axiosClient.post("/nvr/stream/sessions", { streamUrl: streamUrl.trim(), cameraId });
      const sessionId = res.data.sessionId as string;
      sessionIdRef.current = sessionId;

      timeoutRef.current = window.setTimeout(() => {
        clearTimers();
        setStatus("failed");
        setError("Live feed did not become ready within 35 seconds.");
      }, 35000);

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

  return { status, error, start, stop };
}
