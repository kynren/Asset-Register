import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { axiosClient } from "../../api/axiosClient";
import { Icon } from "../../components/Icon";
import { useRtspStream } from "./useRtspStream";

export interface MatrixCamera {
  id: number;
  name: string;
  channel: number | null;
  ipAddress: string | null;
  streamUrl: string | null;
  ptzEnabled: boolean;
}

const LATENCY_POLL_MS = 8000;
const MAX_SAMPLES = 24;

function latencyColor(ms: number | null): string {
  if (ms === null) return "#7b8497";
  if (ms < 60) return "#34d399";
  if (ms < 150) return "#fbbf24";
  return "#f87171";
}

export function MatrixTile({
  slotIndex,
  camera,
  focused,
  muted,
  onFocus,
  onClose,
  registerSnap,
}: {
  slotIndex: number;
  camera: MatrixCamera;
  focused: boolean;
  muted: boolean;
  onFocus: () => void;
  onClose: () => void;
  registerSnap: (index: number, fn: (() => void) | null) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const tileRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const isRtsp = /^rtsps?:\/\//i.test((camera.streamUrl ?? "").trim());
  const { status, error, start, stop } = useRtspStream(camera.streamUrl ?? "", videoRef);

  useEffect(() => {
    if (isRtsp) start();
    return () => stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camera.id, camera.streamUrl]);

  useEffect(() => {
    if (videoRef.current) videoRef.current.muted = muted;
  }, [muted, status]);

  // Recording status — real, reused from the existing recordings endpoint (also drives the
  // Ops modal), polled while this tile is on screen.
  const { data: recordingInfo } = useQuery({
    queryKey: ["camera-recordings-brief", camera.id],
    queryFn: async () => (await axiosClient.get(`/nvr/cameras/${camera.id}/recordings`)).data as { active: { recordingId: number } | null },
    refetchInterval: 6000,
  });

  // Motion watch — real ONVIF event subscription status; only surfaced once an actual event
  // has fired, so this never shows a fabricated "motion level" the app can't back with data.
  const { data: motionInfo } = useQuery({
    queryKey: ["motion-watch-brief", camera.id],
    queryFn: async () => (await axiosClient.get(`/nvr/cameras/${camera.id}/motion-watch`)).data as { status: string; eventsSeen: number },
    refetchInterval: 6000,
  });

  // Real, live-polled latency (no DB writes — see the live-latency route) with a rolling
  // history of genuinely observed samples for the sparkline, not synthesized data.
  const [samples, setSamples] = useState<number[]>([]);
  const [latency, setLatency] = useState<number | null>(null);
  useEffect(() => {
    if (!camera.ipAddress) return;
    let cancelled = false;
    async function poll() {
      try {
        const res = await axiosClient.get(`/nvr/cameras/${camera.id}/live-latency`);
        if (cancelled) return;
        const ms: number | null = res.data.alive ? res.data.responseTimeMs : null;
        setLatency(ms);
        if (ms !== null) setSamples((prev) => [...prev.slice(-(MAX_SAMPLES - 1)), ms]);
      } catch {
        // transient — leave last known value in place
      }
    }
    poll();
    const id = window.setInterval(poll, LATENCY_POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [camera.id, camera.ipAddress]);

  useEffect(() => {
    function handleFullscreenChange() {
      setIsFullscreen(document.fullscreenElement === tileRef.current);
    }
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  function toggleFullscreen() {
    if (document.fullscreenElement === tileRef.current) {
      document.exitFullscreen();
    } else {
      tileRef.current?.requestFullscreen().catch(() => undefined);
    }
  }

  function snapFrame() {
    const video = videoRef.current;
    if (!video || video.readyState < 2) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${camera.name.replace(/\s+/g, "_")}-snapshot-${Date.now()}.png`;
      a.click();
      URL.revokeObjectURL(url);
    }, "image/png");
  }

  useEffect(() => {
    registerSnap(slotIndex, snapFrame);
    return () => registerSnap(slotIndex, null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slotIndex, camera.id]);

  const isLive = status === "ready";
  const isRecording = Boolean(recordingInfo?.active);
  const motionActive = motionInfo?.status === "watching" && (motionInfo?.eventsSeen ?? 0) > 0;
  const sparkPoints = samples
    .map((v, i) => `${(i / Math.max(1, samples.length - 1)) * 40},${14 - Math.min(14, (v / 200) * 14)}`)
    .join(" ");

  return (
    <div ref={tileRef} className={`nvx-tile ${focused ? "focused" : ""}`} onClick={onFocus}>
      <div className="nvx-tile-header">
        <span>{slotIndex + 1} | {camera.name}</span>
        <div className="nvx-tile-actions">
          {isRecording && (
            <span className="nvx-tile-rec">
              <span className="nvx-tile-rec-dot" /> REC
            </span>
          )}
          <button
            type="button"
            className="nvx-tile-icon-btn"
            title={isFullscreen ? "Exit full screen" : "Expand to full screen"}
            onClick={(e) => {
              e.stopPropagation();
              toggleFullscreen();
            }}
          >
            <Icon name="maximize" size={11} />
          </button>
          <button
            type="button"
            className="nvx-tile-icon-btn"
            title="Snap frame"
            onClick={(e) => {
              e.stopPropagation();
              snapFrame();
            }}
          >
            <Icon name="camera" size={11} />
          </button>
          <button
            type="button"
            className="nvx-tile-icon-btn"
            title="Remove from grid"
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
          >
            <Icon name="close" size={11} />
          </button>
        </div>
      </div>

      {motionActive && (
        <div className="nvx-tile-motion">
          <Icon name="activity" size={10} /> MOTION EVENT ({motionInfo?.eventsSeen})
        </div>
      )}

      {isRtsp ? (
        <video ref={videoRef} muted={muted} playsInline style={{ display: isLive ? "block" : "none" }} />
      ) : (
        <div className="nvx-tile-status-msg">No stream URL configured for this channel.</div>
      )}

      {!isLive && isRtsp && (
        <div className="nvx-tile-status-msg">
          {status === "idle" && "Not connected."}
          {status === "starting" && "Connecting..."}
          {status === "reconnecting" && "Reconnecting..."}
          {status === "failed" && (error ?? "Feed unavailable.")}
        </div>
      )}

      <div className="nvx-tile-footer">
        <div className="nvx-tile-footer-left">
          <span className="nvx-tile-ip">{camera.ipAddress ?? "—"}</span>
          {camera.channel != null && <span className="nvx-tile-meta">Channel {camera.channel}</span>}
        </div>
        <div className="nvx-tile-footer-right">
          <span className="nvx-tile-latency" style={{ color: latencyColor(latency) }}>
            {latency !== null ? `${latency} ms` : "—"}
          </span>
          {samples.length > 1 && (
            <svg width="40" height="14" viewBox="0 0 40 14">
              <polyline points={sparkPoints} fill="none" stroke={latencyColor(latency)} strokeWidth="1.5" />
            </svg>
          )}
        </div>
      </div>
    </div>
  );
}
