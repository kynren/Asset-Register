import { useState } from "react";
import { Icon } from "../../components/Icon";
import { detectBrowser, detectOS } from "../../lib/userAgent";
import { useClientInfo } from "../../hooks/useClientInfo";

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 10, letterSpacing: "0.05em", color: "var(--color-text-muted)", marginBottom: 4, textTransform: "uppercase" }}>{label}</div>
      <div style={{ fontSize: 13, fontFamily: mono ? "ui-monospace, SFMono-Regular, Consolas, monospace" : undefined, wordBreak: "break-all" }}>{value}</div>
    </div>
  );
}

type GeoStatus = "idle" | "requesting" | "granted" | "denied" | "unsupported";

interface Coords {
  lat: number;
  lng: number;
  accuracy: number;
}

function mapEmbedUrl({ lat, lng }: Coords): string {
  const delta = 0.01; // roughly a ~1km-wide viewport around the marker
  const bbox = [lng - delta, lat - delta, lng + delta, lat + delta].join(",");
  return `https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(bbox)}&layer=mapnik&marker=${lat}%2C${lng}`;
}

export function CurrentDeviceCard() {
  const { data: serverInfo } = useClientInfo();
  const [geoStatus, setGeoStatus] = useState<GeoStatus>("idle");
  const [coords, setCoords] = useState<Coords | null>(null);

  const ua = navigator.userAgent;
  const dpr = window.devicePixelRatio || 1;
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const isSecure = window.location.protocol === "https:";

  function requestLocation() {
    if (!navigator.geolocation) {
      setGeoStatus("unsupported");
      return;
    }
    setGeoStatus("requesting");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy });
        setGeoStatus("granted");
      },
      () => setGeoStatus("denied"),
      { enableHighAccuracy: true, timeout: 10_000 }
    );
  }

  return (
    <div className="card">
      <h3 className="mt-0">Current Device</h3>
      <p className="muted" style={{ fontSize: 12, marginTop: -6 }}>Information about the device and browser you're currently signed in from.</p>

      <div className="grid grid-cols-2">
        <Field
          label={serverInfo?.source === "agent" ? "IP Address (reported by Kynren agent)" : "IP Address (as seen by server)"}
          value={serverInfo?.observedIp ?? "Loading..."}
          mono
        />
        <Field label="Operating System" value={detectOS(ua)} />
        <Field label="Browser" value={detectBrowser(ua)} />
        <Field label="CPU Threads" value={`${navigator.hardwareConcurrency ?? "—"}`} />
        <Field label="Screen & Display" value={`${screen.width} x ${screen.height} (${dpr}x DPR)`} />
        <Field label="Timezone & Locale" value={`${timezone} · ${navigator.language}`} />
        <Field label="Connection Security" value={isSecure ? "HTTPS Encrypted" : "HTTP (Not Encrypted)"} />
        <Field label="App Version" value={`v${serverInfo?.appVersion ?? "—"}`} />
        {serverInfo?.deviceHostname && <Field label="Device Hostname" value={serverInfo.deviceHostname} mono />}
      </div>

      <div style={{ borderTop: "1px solid var(--color-border)", marginTop: 4, paddingTop: 14 }}>
        <div style={{ fontSize: 10, letterSpacing: "0.05em", color: "var(--color-text-muted)", marginBottom: 8, textTransform: "uppercase" }}>Location</div>

        {geoStatus === "idle" && (
          <button className="btn btn-secondary btn-sm" onClick={requestLocation}>
            <Icon name="mapPin" size={13} /> Show My Location
          </button>
        )}
        {geoStatus === "requesting" && <p className="muted" style={{ fontSize: 12 }}>Waiting for location permission…</p>}
        {geoStatus === "unsupported" && <p className="muted" style={{ fontSize: 12 }}>Your browser doesn't support geolocation.</p>}
        {geoStatus === "denied" && (
          <div className="stack gap-2">
            <p className="muted" style={{ fontSize: 12 }}>Location permission was denied. Allow it in your browser's site settings to show a map here.</p>
            <button className="btn btn-secondary btn-sm" style={{ alignSelf: "flex-start" }} onClick={requestLocation}>Try Again</button>
          </div>
        )}
        {geoStatus === "granted" && coords && (
          <div className="stack gap-2">
            <span className="muted" style={{ fontSize: 12 }}>
              {coords.lat.toFixed(5)}, {coords.lng.toFixed(5)} (accurate to ~{Math.round(coords.accuracy)}m)
            </span>
            <iframe
              title="Current device location"
              src={mapEmbedUrl(coords)}
              style={{ width: "100%", height: 260, border: "1px solid var(--color-border)", borderRadius: 8 }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
