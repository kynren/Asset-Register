import { useEffect, useRef, useState } from "react";
import { useVideoPlayer, VideoPlayer } from "expo-video";
import { axiosClient } from "../api/axiosClient";
import { getAccessToken } from "../api/tokenStore";
import { API_ORIGIN } from "../config/env";

export type FeedStatus = "idle" | "starting" | "ready" | "reconnecting" | "failed";

const HEALTH_POLL_MS = 5000;
const RECONNECT_DELAY_MS = 2000;
const START_TIMEOUT_MS = 35000;

// Mobile port of client/src/pages/nvr/useRtspStream.ts. The server side is identical (one real
// ffmpeg RTSP→HLS relay session per camera, same /nvr/stream/sessions endpoints) — what differs
// is playback: web attaches hls.js to a <video> element, but expo-video's native player (AVPlayer/
// ExoPlayer) plays HLS directly, and its VideoSource.headers option carries the bearer token the
// segment/playlist requests need, so no JS-side HLS parser is required here at all.
export function useHlsStream(player: VideoPlayer, streamUrl: string | null, cameraId?: number) {
  const sessionIdRef = useRef<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const userStoppedRef = useRef(false);
  const [status, setStatus] = useState<FeedStatus>("idle");
  const [error, setError] = useState<string | null>(null);

  function clearTimers() {
    if (pollRef.current) clearInterval(pollRef.current);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
    pollRef.current = null;
    timeoutRef.current = null;
    reconnectTimeoutRef.current = null;
  }

  function teardownSession() {
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
    player.pause();
    setStatus("idle");
    setError(null);
  }

  function reconnect(reason: string) {
    if (userStoppedRef.current) return;
    clearTimers();
    teardownSession();
    setStatus("reconnecting");
    setError(reason);
    reconnectTimeoutRef.current = setTimeout(() => start(), RECONNECT_DELAY_MS);
  }

  function startHealthPoll(sessionId: string) {
    pollRef.current = setInterval(async () => {
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
    if (!streamUrl) return;
    userStoppedRef.current = false;
    setError(null);
    setStatus((prev) => (prev === "reconnecting" ? prev : "starting"));
    try {
      const res = await axiosClient.post("/nvr/stream/sessions", { streamUrl: streamUrl.trim(), cameraId });
      const sessionId = res.data.sessionId as string;
      sessionIdRef.current = sessionId;

      timeoutRef.current = setTimeout(() => {
        clearTimers();
        setStatus("failed");
        setError("Live feed did not become ready within 35 seconds.");
      }, START_TIMEOUT_MS);

      pollRef.current = setInterval(async () => {
        try {
          const statusRes = await axiosClient.get(`/nvr/stream/sessions/${sessionId}/status`);
          if (statusRes.data.status === "ready") {
            clearTimers();
            setStatus("ready");
            const token = getAccessToken();
            await player.replaceAsync({
              uri: `${API_ORIGIN}/api/nvr/stream/sessions/${sessionId}/playlist.m3u8`,
              headers: token ? { Authorization: `Bearer ${token}` } : undefined,
            });
            player.play();
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
