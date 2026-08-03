import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { axiosClient } from "../../api/axiosClient";
import { Icon } from "../../components/Icon";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { usePermission } from "../../auth/PermissionGate";
import { SiteMapDevicePanel } from "./SiteMapDevicePanel";
import { SiteMapDetail, SiteMapPlacement, SiteMapShapeType } from "./siteMapTypes";

interface LightingDeviceOption {
  id: number;
  name: string;
  isOn: boolean;
  status: string;
  icon: string | null;
}

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

interface DrawingState {
  placementId: number;
  shapeType: Exclude<SiteMapShapeType, "NONE">;
}

export function SiteMapEditor({ siteMapId, onBack }: { siteMapId: number; onBack: () => void }) {
  const [mode, setMode] = useState<"view" | "edit">("view");
  const [editingPlacement, setEditingPlacement] = useState<SiteMapPlacement | null>(null);
  const [deletingPlacement, setDeletingPlacement] = useState<SiteMapPlacement | null>(null);
  const [drawing, setDrawing] = useState<DrawingState | null>(null);
  const [draftPoints, setDraftPoints] = useState<{ x: number; y: number }[]>([]);
  const [draftRadius, setDraftRadius] = useState<number | null>(null);
  const [dragPos, setDragPos] = useState<{ placementId: number; x: number; y: number; moved: boolean } | null>(null);
  const [flashing, setFlashing] = useState<Set<number>>(new Set());
  const [toggleCounts, setToggleCounts] = useState<Record<number, number>>({});
  const [isFullscreen, setIsFullscreen] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  // A callback ref (not a plain ref + []-effect) because the container div only mounts once the
  // `siteMap` query resolves — an effect with an empty dependency array would fire once while the
  // ref is still null (during the "Loading..." early return) and never re-run once the real div
  // attaches, leaving `size` stuck at 0.
  const [containerEl, setContainerEl] = useState<HTMLDivElement | null>(null);
  const containerRef = { current: containerEl };
  const [size, setSize] = useState({ width: 0, height: 0 });
  const prevIsOnRef = useRef<Map<number, boolean>>(new Map());
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const queryClient = useQueryClient();
  const canEdit = usePermission("lighting", "edit");

  const { data: siteMap } = useQuery({
    queryKey: ["lighting-site-map", siteMapId],
    queryFn: async () => (await axiosClient.get(`/lighting/site-maps/${siteMapId}`)).data as SiteMapDetail,
    refetchInterval: 10_000,
  });

  const { data: allDevices } = useQuery({
    queryKey: ["lighting-devices"],
    queryFn: async () => (await axiosClient.get("/lighting/devices")).data as LightingDeviceOption[],
    enabled: mode === "edit",
  });

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["lighting-site-map", siteMapId] });
  }

  const powerMutation = useMutation({
    mutationFn: ({ id, on }: { id: number; on: boolean }) => axiosClient.post(`/lighting/devices/${id}/power`, { on }),
    onSuccess: invalidate,
  });
  const addDeviceMutation = useMutation({
    mutationFn: (body: { deviceId: number; x: number; y: number }) => axiosClient.post(`/lighting/site-maps/${siteMapId}/devices`, body),
    onSuccess: invalidate,
  });
  const updatePlacementMutation = useMutation({
    mutationFn: ({ placementId, ...body }: { placementId: number } & Record<string, unknown>) =>
      axiosClient.patch(`/lighting/site-maps/${siteMapId}/devices/${placementId}`, body),
    onSuccess: invalidate,
  });
  const deletePlacementMutation = useMutation({
    mutationFn: (placementId: number) => axiosClient.delete(`/lighting/site-maps/${siteMapId}/devices/${placementId}`),
    onSuccess: () => { invalidate(); setDeletingPlacement(null); setEditingPlacement(null); },
  });

  useEffect(() => {
    if (!containerEl) return;
    const obs = new ResizeObserver((entries) => {
      const box = entries[0].contentRect;
      setSize({ width: box.width, height: box.height });
    });
    obs.observe(containerEl);
    return () => obs.disconnect();
  }, [containerEl]);

  useEffect(() => {
    function handleFullscreenChange() {
      setIsFullscreen(document.fullscreenElement === cardRef.current);
    }
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  function toggleFullscreen() {
    if (document.fullscreenElement === cardRef.current) {
      document.exitFullscreen();
    } else {
      cardRef.current?.requestFullscreen().catch(() => undefined);
    }
  }

  // Poll-diff animation: compares each placement's live isOn against what it was on the previous
  // poll and flashes the marker + shape for ~1.2s when it flips — no websocket, just the same
  // interval-poll pattern already used across the app.
  useEffect(() => {
    if (!siteMap) return;
    const flipped: number[] = [];
    for (const p of siteMap.devices) {
      const prev = prevIsOnRef.current.get(p.id);
      if (prev !== undefined && prev !== p.device.isOn) flipped.push(p.id);
      prevIsOnRef.current.set(p.id, p.device.isOn);
    }
    if (flipped.length === 0) return;
    setToggleCounts((c) => {
      const next = { ...c };
      for (const id of flipped) next[id] = (next[id] ?? 0) + 1;
      return next;
    });
    setFlashing((prev) => new Set([...prev, ...flipped]));
    const timer = setTimeout(() => {
      setFlashing((prev) => {
        const next = new Set(prev);
        for (const id of flipped) next.delete(id);
        return next;
      });
    }, 1200);
    timersRef.current.push(timer);
  }, [siteMap]);

  useEffect(() => () => timersRef.current.forEach(clearTimeout), []);

  const unplacedDevices = useMemo(() => {
    if (!allDevices || !siteMap) return [];
    const placedIds = new Set(siteMap.devices.map((p) => p.deviceId));
    return allDevices.filter((d) => !placedIds.has(d.id));
  }, [allDevices, siteMap]);

  function clientToPercent(clientX: number, clientY: number) {
    const rect = containerRef.current!.getBoundingClientRect();
    return { x: clamp(((clientX - rect.left) / rect.width) * 100, 0, 100), y: clamp(((clientY - rect.top) / rect.height) * 100, 0, 100) };
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    const deviceId = Number(e.dataTransfer.getData("text/device-id"));
    if (!deviceId || !containerRef.current) return;
    const { x, y } = clientToPercent(e.clientX, e.clientY);
    addDeviceMutation.mutate({ deviceId, x, y });
  }

  function handleMarkerPointerDown(e: React.PointerEvent, placement: SiteMapPlacement) {
    if (mode !== "edit") return;
    e.stopPropagation();
    (e.target as Element).setPointerCapture(e.pointerId);

    if (drawing?.placementId === placement.id && drawing.shapeType === "CIRCLE") {
      setDraftRadius(0);
      return;
    }
    if (drawing) return; // mid-polygon/path draw — marker drag is disabled until it's finished
    setDragPos({ placementId: placement.id, x: placement.x, y: placement.y, moved: false });
  }

  function handleMarkerPointerMove(e: React.PointerEvent, placement: SiteMapPlacement) {
    if (!containerRef.current) return;

    if (drawing?.placementId === placement.id && drawing.shapeType === "CIRCLE" && draftRadius !== null) {
      const rect = containerRef.current.getBoundingClientRect();
      const cx = rect.left + (placement.x / 100) * rect.width;
      const cy = rect.top + (placement.y / 100) * rect.height;
      const dist = Math.hypot(e.clientX - cx, e.clientY - cy);
      setDraftRadius(clamp((dist / rect.width) * 100, 0.5, 100));
      return;
    }

    if (dragPos?.placementId === placement.id) {
      const { x, y } = clientToPercent(e.clientX, e.clientY);
      setDragPos({ placementId: placement.id, x, y, moved: true });
    }
  }

  function handleMarkerPointerUp(e: React.PointerEvent, placement: SiteMapPlacement) {
    if (drawing?.placementId === placement.id && drawing.shapeType === "CIRCLE" && draftRadius !== null) {
      updatePlacementMutation.mutate({ placementId: placement.id, shapeType: "CIRCLE", shapeData: { radius: draftRadius } });
      setDrawing(null);
      setDraftRadius(null);
      return;
    }

    if (dragPos?.placementId === placement.id) {
      if (dragPos.moved) {
        updatePlacementMutation.mutate({ placementId: placement.id, x: dragPos.x, y: dragPos.y });
      } else if (mode === "edit") {
        setEditingPlacement(placement);
      } else {
        powerMutation.mutate({ id: placement.deviceId, on: !placement.device.isOn });
      }
      setDragPos(null);
    }
  }

  function handleCanvasClick(e: React.MouseEvent) {
    if (!drawing || drawing.shapeType === "CIRCLE" || !containerRef.current) return;
    const { x, y } = clientToPercent(e.clientX, e.clientY);
    setDraftPoints((pts) => [...pts, { x, y }]);
  }

  function finishDrawing() {
    if (!drawing || draftPoints.length < 2) return;
    updatePlacementMutation.mutate({ placementId: drawing.placementId, shapeType: drawing.shapeType, shapeData: { points: draftPoints } });
    setDrawing(null);
    setDraftPoints([]);
  }

  function cancelDrawing() {
    setDrawing(null);
    setDraftPoints([]);
    setDraftRadius(null);
  }

  function toPx(pct: number, axis: "x" | "y") {
    return axis === "x" ? (pct / 100) * size.width : (pct / 100) * size.height;
  }

  if (!siteMap) {
    return <div className="empty-state">Loading site map...</div>;
  }

  return (
    <div className="stack gap-3">
      <div className="row gap-2" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <div className="row gap-2" style={{ alignItems: "center" }}>
          <button className="btn btn-secondary btn-sm" onClick={onBack}><Icon name="chevronLeft" size={12} /> Site Maps</button>
          <strong style={{ fontSize: 15 }}>{siteMap.name}</strong>
        </div>
        <div className="row gap-2">
          {canEdit && (
            <>
              <button className={`btn btn-sm ${mode === "view" ? "btn-primary" : "btn-secondary"}`} onClick={() => { setMode("view"); cancelDrawing(); }}>View</button>
              <button className={`btn btn-sm ${mode === "edit" ? "btn-primary" : "btn-secondary"}`} onClick={() => setMode("edit")}>Edit Layout</button>
            </>
          )}
          <button className="btn-icon" onClick={toggleFullscreen} title={isFullscreen ? "Exit full screen" : "Expand to full screen"}>
            <Icon name="maximize" size={14} />
          </button>
        </div>
      </div>

      {drawing && (
        <div className="card row gap-2" style={{ alignItems: "center", padding: "8px 12px" }}>
          <Icon name="edit" size={14} />
          <span style={{ fontSize: 12 }}>
            {drawing.shapeType === "CIRCLE"
              ? "Press and drag from the marker to size the coverage circle."
              : `Click on the map to add points to the ${drawing.shapeType === "POLYGON" ? "zone" : "path"}, then Finish.`}
          </span>
          {drawing.shapeType !== "CIRCLE" && (
            <button className="btn btn-primary btn-sm" style={{ marginLeft: "auto" }} disabled={draftPoints.length < 2} onClick={finishDrawing}>Finish</button>
          )}
          <button className="btn btn-secondary btn-sm" onClick={cancelDrawing}>Cancel</button>
        </div>
      )}

      <div className="row gap-3" style={{ alignItems: "flex-start" }}>
        <div
          ref={cardRef}
          className="card"
          style={{
            padding: 0,
            flex: 1,
            overflow: "hidden",
            height: isFullscreen ? "100vh" : "calc(100vh - 260px)",
            minHeight: 420,
            background: "var(--color-bg)",
          }}
        >
          <div
            ref={setContainerEl}
            style={{ position: "relative", width: "100%", height: "100%" }}
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
          >
            {/* object-fit: cover — the canvas fills the container edge-to-edge (rather than
                letterboxing to the image's own aspect ratio), which keeps the SVG/marker overlay's
                percentage coordinates lined up exactly with the visible image with no dead space. */}
            <img
              src={siteMap.imageUrl}
              alt={siteMap.name}
              draggable={false}
              style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", display: "block" }}
            />

            <svg
              width={size.width}
              height={size.height}
              viewBox={`0 0 ${size.width} ${size.height}`}
              style={{ position: "absolute", inset: 0, cursor: drawing && drawing.shapeType !== "CIRCLE" ? "crosshair" : undefined }}
              onClick={handleCanvasClick}
            >
              {siteMap.devices.map((p) => {
                const isDrawingThis = drawing?.placementId === p.id;
                const shapeType = isDrawingThis ? drawing.shapeType : p.shapeType;
                const shapeData = isDrawingThis ? null : p.shapeData;
                const fill = p.zoneOnColor ?? "#f2b705";
                const opacity = p.device.isOn ? 0.32 : 0.12;

                if (shapeType === "CIRCLE" && shapeData && "radius" in shapeData) {
                  return (
                    <circle key={`shape-${p.id}`} cx={toPx(p.x, "x")} cy={toPx(p.y, "y")} r={toPx(shapeData.radius, "x")} fill={fill} fillOpacity={opacity} stroke={fill} strokeOpacity={opacity + 0.2} />
                  );
                }
                if ((shapeType === "POLYGON" || shapeType === "PATH") && shapeData && "points" in shapeData) {
                  const pts = shapeData.points.map((pt) => `${toPx(pt.x, "x")},${toPx(pt.y, "y")}`).join(" ");
                  return shapeType === "POLYGON" ? (
                    <polygon key={`shape-${p.id}`} points={pts} fill={fill} fillOpacity={opacity} stroke={fill} strokeOpacity={opacity + 0.2} strokeWidth={2} />
                  ) : (
                    <polyline key={`shape-${p.id}`} points={pts} fill="none" stroke={fill} strokeOpacity={p.device.isOn ? 0.85 : 0.35} strokeWidth={4} strokeLinecap="round" />
                  );
                }
                return null;
              })}

              {/* Live draft preview while drawing a new shape */}
              {drawing && drawing.shapeType === "CIRCLE" && draftRadius !== null && (() => {
                const p = siteMap.devices.find((d) => d.id === drawing.placementId);
                if (!p) return null;
                return <circle cx={toPx(p.x, "x")} cy={toPx(p.y, "y")} r={toPx(draftRadius, "x")} fill="var(--color-primary)" fillOpacity={0.25} stroke="var(--color-primary)" strokeDasharray="4 3" />;
              })()}
              {drawing && drawing.shapeType !== "CIRCLE" && draftPoints.length > 0 && (
                <polyline
                  points={draftPoints.map((pt) => `${toPx(pt.x, "x")},${toPx(pt.y, "y")}`).join(" ")}
                  fill={drawing.shapeType === "POLYGON" ? "var(--color-primary)" : "none"}
                  fillOpacity={0.2}
                  stroke="var(--color-primary)"
                  strokeWidth={2}
                  strokeDasharray="4 3"
                />
              )}
              {drawing && drawing.shapeType !== "CIRCLE" &&
                draftPoints.map((pt, i) => <circle key={i} cx={toPx(pt.x, "x")} cy={toPx(pt.y, "y")} r={4} fill="var(--color-primary)" />)}

              {/* One-shot ripple on toggle */}
              {siteMap.devices.filter((p) => flashing.has(p.id)).map((p) => (
                <circle
                  key={`ripple-${p.id}-${toggleCounts[p.id]}`}
                  cx={toPx(p.x, "x")}
                  cy={toPx(p.y, "y")}
                  r={16}
                  fill="none"
                  stroke={p.device.isOn ? "var(--color-success)" : "var(--color-danger)"}
                  strokeWidth={3}
                  style={{ animation: "kynren-pulse-ring 0.7s ease-out", transformOrigin: `${toPx(p.x, "x")}px ${toPx(p.y, "y")}px` }}
                />
              ))}
            </svg>

            <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
              {siteMap.devices.map((p) => {
                const dragged = dragPos?.placementId === p.id ? dragPos : null;
                const left = dragged ? dragged.x : p.x;
                const top = dragged ? dragged.y : p.y;
                const on = p.device.isOn;
                const icon = on ? p.onIcon ?? p.device.icon ?? "bulb" : p.offIcon ?? p.device.icon ?? "bulb";
                const color = on ? p.onColor ?? "#f2b705" : p.offColor ?? "#8a8f98";
                return (
                  <button
                    key={p.id}
                    className={flashing.has(p.id) ? "status-flash" : undefined}
                    onPointerDown={(e) => handleMarkerPointerDown(e, p)}
                    onPointerMove={(e) => handleMarkerPointerMove(e, p)}
                    onPointerUp={(e) => handleMarkerPointerUp(e, p)}
                    title={p.device.name}
                    style={{
                      position: "absolute",
                      left: `${left}%`,
                      top: `${top}%`,
                      transform: "translate(-50%, -50%)",
                      width: 32,
                      height: 32,
                      borderRadius: "50%",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      background: color,
                      color: "#fff",
                      border: "2px solid var(--color-surface)",
                      boxShadow: "0 2px 6px rgba(0,0,0,0.3)",
                      cursor: mode === "edit" ? "grab" : "pointer",
                      pointerEvents: "auto",
                    }}
                  >
                    <Icon name={icon} size={16} />
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {mode === "edit" && (
          <div className="card" style={{ width: 220, flexShrink: 0 }}>
            <strong style={{ fontSize: 13 }}>Devices</strong>
            <p className="muted" style={{ fontSize: 11, margin: "4px 0 8px" }}>Drag a device onto the map to place it.</p>
            <div className="stack gap-1">
              {unplacedDevices.length === 0 && <p className="muted" style={{ fontSize: 11 }}>All devices are placed.</p>}
              {unplacedDevices.map((d) => (
                <div
                  key={d.id}
                  draggable
                  onDragStart={(e) => e.dataTransfer.setData("text/device-id", String(d.id))}
                  className="row gap-2"
                  style={{ alignItems: "center", padding: "6px 8px", borderRadius: 8, cursor: "grab", background: "var(--color-surface-muted, rgba(127,127,127,0.08))" }}
                >
                  <Icon name={d.icon ?? "bulb"} size={14} />
                  <span style={{ fontSize: 12 }}>{d.name}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {editingPlacement && (
        <SiteMapDevicePanel
          placement={siteMap.devices.find((p) => p.id === editingPlacement.id) ?? editingPlacement}
          onClose={() => setEditingPlacement(null)}
          saving={updatePlacementMutation.isPending}
          onSave={(patch) => {
            updatePlacementMutation.mutate({ placementId: editingPlacement.id, ...patch });
            setEditingPlacement(null);
          }}
          onClearShape={() => {
            updatePlacementMutation.mutate({ placementId: editingPlacement.id, shapeType: "NONE", shapeData: null });
            setEditingPlacement(null);
          }}
          onStartDrawing={(shapeType) => {
            setDrawing({ placementId: editingPlacement.id, shapeType });
            setDraftPoints([]);
            setDraftRadius(null);
            setEditingPlacement(null);
          }}
          onDelete={() => { setDeletingPlacement(editingPlacement); }}
        />
      )}

      {deletingPlacement && (
        <ConfirmDialog
          title="Remove from map"
          message={`Remove "${deletingPlacement.device.name}" from this site map? The device itself is not deleted.`}
          danger
          loading={deletePlacementMutation.isPending}
          onCancel={() => setDeletingPlacement(null)}
          onConfirm={() => deletePlacementMutation.mutate(deletingPlacement.id)}
        />
      )}
    </div>
  );
}
