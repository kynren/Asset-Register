import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { axiosClient } from "../../api/axiosClient";
import { Icon } from "../../components/Icon";
import { StatusBadge } from "../../components/StatusBadge";

interface Camera {
  id: number;
  name: string;
  location: string | null;
  streamUrl: string | null;
  status: string;
}
interface Nvr {
  id: number;
  name: string;
  cameras: Camera[];
}

const LAYOUTS = [
  { key: "1x1", cols: 1, count: 1 },
  { key: "2x2", cols: 2, count: 4 },
  { key: "3x3", cols: 3, count: 9 },
  { key: "4x4", cols: 4, count: 16 },
] as const;

export function LiveViewTab() {
  const [layoutKey, setLayoutKey] = useState<(typeof LAYOUTS)[number]["key"]>("2x2");
  const [slots, setSlots] = useState<(number | null)[]>(Array(4).fill(null));

  const { data: nvrs } = useQuery({
    queryKey: ["nvrs"],
    queryFn: async () => (await axiosClient.get("/nvr")).data as Nvr[],
  });

  const cameras = nvrs?.flatMap((n) => n.cameras.map((c) => ({ ...c, nvrName: n.name }))) ?? [];
  const layout = LAYOUTS.find((l) => l.key === layoutKey)!;

  useEffect(() => {
    setSlots((prev) => {
      const next = Array(layout.count).fill(null);
      for (let i = 0; i < Math.min(prev.length, layout.count); i++) next[i] = prev[i];
      return next;
    });
  }, [layout.count]);

  function assignSlot(index: number, cameraId: number | null) {
    setSlots((prev) => prev.map((v, i) => (i === index ? cameraId : v)));
  }

  return (
    <div className="stack gap-3">
      <div className="card">
        <div className="row gap-2 flex-wrap" style={{ justifyContent: "space-between" }}>
          <strong style={{ fontSize: 13 }}>Layout</strong>
          <div className="row gap-2">
            {LAYOUTS.map((l) => (
              <button key={l.key} className={`btn btn-sm ${layoutKey === l.key ? "btn-primary" : "btn-secondary"}`} onClick={() => setLayoutKey(l.key)}>
                {l.key}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid" style={{ gridTemplateColumns: `repeat(${layout.cols}, 1fr)`, gap: 10 }}>
        {slots.map((cameraId, index) => {
          const camera = cameras.find((c) => c.id === cameraId);
          return (
            <div key={index} className="card" style={{ padding: 8 }}>
              <select
                className="select"
                style={{ marginBottom: 6, fontSize: 12 }}
                value={cameraId ?? ""}
                onChange={(e) => assignSlot(index, e.target.value ? Number(e.target.value) : null)}
              >
                <option value="">Empty</option>
                {cameras.map((c) => <option key={c.id} value={c.id}>{c.nvrName} / {c.name}</option>)}
              </select>
              <div style={{ width: "100%", aspectRatio: "16/9", borderRadius: 6, background: "#000", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", position: "relative" }}>
                {camera?.streamUrl ? (
                  <img src={camera.streamUrl} alt={camera.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                ) : (
                  <span style={{ color: "#667085" }}><Icon name="camera" size={28} /></span>
                )}
                {camera && (
                  <span style={{ position: "absolute", bottom: 4, left: 4 }}>
                    <StatusBadge status={camera.status} />
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
