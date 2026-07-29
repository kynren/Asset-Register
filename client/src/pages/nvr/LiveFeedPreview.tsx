import { useRef } from "react";
import { Icon } from "../../components/Icon";
import { useRtspStream } from "./useRtspStream";

function RtspPreview({ streamUrl }: { streamUrl: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const { status, error, start, stop } = useRtspStream(streamUrl, videoRef);

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
