import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { axiosClient } from "../../api/axiosClient";
import { Icon } from "../../components/Icon";

interface DiscoveredChannel {
  name: string;
  profileToken: string;
  streamUri: string | null;
  snapshotUri: string | null;
}

export function DiscoverCamerasPanel({
  nvrId,
  ipAddress,
  port,
  username,
  password,
  onImported,
}: {
  nvrId: number;
  ipAddress: string;
  port: number | null;
  username: string;
  password: string;
  onImported: () => void;
}) {
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const discoverMutation = useMutation({
    mutationFn: () => axiosClient.post("/nvr/discover-cameras", { ipAddress, port, username: username || undefined, password: password || undefined }),
    onSuccess: () => setSelected(new Set()),
  });

  const importMutation = useMutation({
    mutationFn: (channels: DiscoveredChannel[]) => axiosClient.post(`/nvr/${nvrId}/import-cameras`, { channels }),
    onSuccess: () => {
      discoverMutation.reset();
      setSelected(new Set());
      onImported();
    },
  });

  const channels: DiscoveredChannel[] = discoverMutation.data?.data?.channels ?? [];
  const discoveryMessage: string | undefined = discoverMutation.data?.data?.message;

  function toggle(index: number) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  return (
    <div className="field">
      <label>Discover &amp; Import Cameras (ONVIF)</label>
      <button className="btn btn-secondary" type="button" disabled={!ipAddress || discoverMutation.isPending} onClick={() => discoverMutation.mutate()}>
        <Icon name="search" size={13} /> {discoverMutation.isPending ? "Discovering..." : "Discover Cameras"}
      </button>

      {discoveryMessage && (
        <div className={`alert ${channels.length > 0 ? "alert-success" : "alert-warning"}`} style={{ marginTop: 8 }}>
          {discoveryMessage}
        </div>
      )}

      {channels.length > 0 && (
        <>
          <div className="stack gap-1" style={{ marginTop: 8, maxHeight: 200, overflowY: "auto" }}>
            {channels.map((ch, i) => (
              <label key={i} className="row gap-2" style={{ padding: "6px 8px", border: "1px solid var(--color-border)", borderRadius: 6, cursor: "pointer" }}>
                <input type="checkbox" checked={selected.has(i)} onChange={() => toggle(i)} />
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{ch.name}</div>
                  <div className="muted" style={{ fontSize: 11 }}>{ch.streamUri ?? "No stream URI reported"}</div>
                </div>
              </label>
            ))}
          </div>
          <button
            className="btn btn-primary"
            type="button"
            style={{ marginTop: 8 }}
            disabled={selected.size === 0 || importMutation.isPending}
            onClick={() => importMutation.mutate(channels.filter((_, i) => selected.has(i)))}
          >
            <Icon name="download" size={13} /> Import {selected.size || ""} Selected
          </button>
        </>
      )}
      {importMutation.isSuccess && <div className="alert alert-success" style={{ marginTop: 8 }}>Cameras imported.</div>}
    </div>
  );
}
