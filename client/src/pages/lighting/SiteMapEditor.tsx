import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { axiosClient } from "../../api/axiosClient";
import { Icon } from "../../components/Icon";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { usePermission } from "../../auth/PermissionGate";
import { useDebouncedCallback } from "../../hooks/useDebouncedCallback";
import { SiteMapDevicePanel } from "./SiteMapDevicePanel";
import { SiteMapDetail, SiteMapPlacement, SiteMapShapeType } from "./siteMapTypes";

// A default "reveal" radius (in the same 0-100 percent-of-width space as everything else on this
// canvas) used by the dark-overlay mask for a light that has no drawn coverage shape yet — without
// this, an un-shaped light would never punch a hole in the overlay at all.
const DEFAULT_REVEAL_RADIUS_PCT = 8;

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

interface DraftSnapshot {
  points: { x: number; y: number }[];
  radius: number | null;
}

export function SiteMapEditor({ siteMapId, onBack }: { siteMapId: number; onBack: () => void }) {
  const [mode, setMode] = useState<"view" | "edit">("view");
  const [editingPlacement, setEditingPlacement] = useState<SiteMapPlacement | null>(null);
  const [deletingPlacement, setDeletingPlacement] = useState<SiteMapPlacement | null>(null);
  const [drawing, setDrawing] = useState<DrawingState | null>(null);
  const [draftPoints, setDraftPoints] = useState<{ x: number; y: number }[]>([]);
  const [draftRadius, setDraftRadius] = useState<number | null>(null);
  // Undo/redo history for the shape currently being drawn or edited — a stack of full draft
  // snapshots (not per-keystroke deltas) pushed at the start of every discrete edit gesture
  // (add point, delete point, finish a drag), so one Undo always reverts exactly one gesture.
  const [pastDrafts, setPastDrafts] = useState<DraftSnapshot[]>([]);
  const [futureDrafts, setFutureDrafts] = useState<DraftSnapshot[]>([]);
  const [draggingPointIndex, setDraggingPointIndex] = useState<number | null>(null);
  // Freehand PATH painting: while the pointer is down over the canvas, points are appended
  // continuously (distance-throttled) instead of one per click — a "press and drag" stroke like a
  // paintbrush rather than placing polygon vertices. Circle/Zone keep their existing precise tools
  // (drag-to-size, click-to-place-vertex) since coarse freehand strokes suit a walkway/path shape
  // better than a boundary you want exact corners on.
  const isPaintingRef = useRef(false);
  const lastPaintPointRef = useRef<{ x: number; y: number } | null>(null);
  const [dragPos, setDragPos] = useState<{ placementId: number; x: number; y: number; moved: boolean } | null>(null);
  const [flashing, setFlashing] = useState<Set<number>>(new Set());
  const [toggleCounts, setToggleCounts] = useState<Record<number, number>>({});
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const panRef = useRef<{ pointerId: number; startClientX: number; startClientY: number; originPan: { x: number; y: number } } | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  const MIN_ZOOM = 0.5;
  const MAX_ZOOM = 4;

  function resetView() {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }

  // A separate map (and re-opening the same map) always starts from a known, centered view rather
  // than carrying over wherever the previous map happened to be panned/zoomed to.
  useEffect(() => {
    resetView();
  }, [siteMapId]);

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
  const overlayMutation = useMutation({
    mutationFn: (overlayDensity: number) => axiosClient.patch(`/lighting/site-maps/${siteMapId}/overlay`, { overlayDensity }),
    onSuccess: invalidate,
  });
  const debouncedSaveOverlay = useDebouncedCallback((density: number) => overlayMutation.mutate(density), 400);
  // Local, immediately-responsive copy of the slider value — mirrors siteMap.overlayDensity but
  // decoupled from it so mid-drag frames aren't clobbered by the 10s poll re-fetching the
  // not-yet-saved server value out from under the user's thumb.
  const [overlayDraft, setOverlayDraft] = useState<number | null>(null);

  // Records the pre-gesture draft state before a discrete edit (add/remove/reposition a point,
  // finish a circle resize) so Undo has something to revert to; any pending Redo stack is
  // discarded, matching standard undo/redo semantics.
  function pushDraftHistory() {
    setPastDrafts((p) => [...p, { points: draftPoints, radius: draftRadius }]);
    setFutureDrafts([]);
  }
  function undoDraft() {
    setPastDrafts((past) => {
      if (past.length === 0) return past;
      const prev = past[past.length - 1];
      setFutureDrafts((f) => [...f, { points: draftPoints, radius: draftRadius }]);
      setDraftPoints(prev.points);
      setDraftRadius(prev.radius);
      return past.slice(0, -1);
    });
  }
  function redoDraft() {
    setFutureDrafts((future) => {
      if (future.length === 0) return future;
      const next = future[future.length - 1];
      setPastDrafts((p) => [...p, { points: draftPoints, radius: draftRadius }]);
      setDraftPoints(next.points);
      setDraftRadius(next.radius);
      return future.slice(0, -1);
    });
  }

  useEffect(() => {
    if (!containerEl) return;
    const obs = new ResizeObserver((entries) => {
      const box = entries[0].contentRect;
      setSize({ width: box.width, height: box.height });
    });
    obs.observe(containerEl);
    return () => obs.disconnect();
  }, [containerEl]);

  // Attached as a real (non-passive) DOM listener rather than React's onWheel — React 17+
  // registers wheel handlers as passive by default, which silently ignores preventDefault() and
  // lets the page itself scroll underneath while the map is meant to be zooming instead.
  useEffect(() => {
    if (!containerEl) return;
    function onWheel(e: WheelEvent) {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
      setZoom((z) => clamp(z * factor, MIN_ZOOM, MAX_ZOOM));
    }
    containerEl.addEventListener("wheel", onWheel, { passive: false });
    return () => containerEl.removeEventListener("wheel", onWheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [containerEl]);

  useEffect(() => {
    function handleFullscreenChange() {
      setIsFullscreen(document.fullscreenElement === cardRef.current);
    }
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  // Ctrl/Cmd+Z / Ctrl/Cmd+Shift+Z (or Ctrl+Y) undo/redo while actively drawing or editing a shape
  // — only bound while `drawing` is set so it never fights the browser's own undo elsewhere.
  useEffect(() => {
    if (!drawing) return;
    function onKeyDown(e: KeyboardEvent) {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== "z") return;
      e.preventDefault();
      if (e.shiftKey) redoDraft();
      else undoDraft();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawing, draftPoints, draftRadius]);

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

  // Click-and-drag-to-pan on the empty canvas background — gated on the pointerdown not having
  // originated on a marker button (those have their own click/drag handling) and on not currently
  // mid-drawing a shape (where clicks are meant to place polygon/path points instead).
  function handleCanvasPanPointerDown(e: React.PointerEvent) {
    if (drawing) return;
    if ((e.target as HTMLElement).closest("button")) return;
    panRef.current = { pointerId: e.pointerId, startClientX: e.clientX, startClientY: e.clientY, originPan: pan };
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
  }

  function handleCanvasPanPointerMove(e: React.PointerEvent) {
    if (!panRef.current || panRef.current.pointerId !== e.pointerId) return;
    const dx = e.clientX - panRef.current.startClientX;
    const dy = e.clientY - panRef.current.startClientY;
    setPan({ x: panRef.current.originPan.x + dx, y: panRef.current.originPan.y + dy });
  }

  function handleCanvasPanPointerUp(e: React.PointerEvent) {
    if (panRef.current?.pointerId === e.pointerId) panRef.current = null;
  }

  function handleMarkerPointerDown(e: React.PointerEvent, placement: SiteMapPlacement) {
    if (mode !== "edit") return;
    e.stopPropagation();
    (e.target as Element).setPointerCapture(e.pointerId);

    if (drawing?.placementId === placement.id && drawing.shapeType === "CIRCLE") {
      pushDraftHistory();
      setDraftRadius((r) => r ?? 0);
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
      } else {
        setEditingPlacement(placement);
      }
      setDragPos(null);
    }
  }

  // View-mode marker click: toggles the device's power. A plain onClick rather than folding this
  // into the pointer down/up pair above, since dragPos (and pointer capture) is only ever set in
  // edit mode — outside of it a marker isn't draggable, so there's nothing for a pointer-capture
  // dance to disambiguate from a click.
  function handleMarkerClick(placement: SiteMapPlacement) {
    if (mode === "edit") return;
    powerMutation.mutate({ id: placement.deviceId, on: !placement.device.isOn });
  }

  function handleCanvasClick(e: React.MouseEvent) {
    if (!drawing || drawing.shapeType !== "POLYGON" || !containerRef.current || draggingPointIndex !== null) return;
    const { x, y } = clientToPercent(e.clientX, e.clientY);
    pushDraftHistory();
    setDraftPoints((pts) => [...pts, { x, y }]);
  }

  // One history entry per stroke (pointer down → up), not per sampled point — so one Undo removes
  // the whole stroke just painted, matching how undo reads in an actual paint tool.
  function handlePathPaintPointerDown(e: React.PointerEvent) {
    if (!drawing || drawing.shapeType !== "PATH" || !containerRef.current) return;
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    pushDraftHistory();
    isPaintingRef.current = true;
    const { x, y } = clientToPercent(e.clientX, e.clientY);
    lastPaintPointRef.current = { x, y };
    setDraftPoints((pts) => [...pts, { x, y }]);
  }
  function handlePathPaintPointerMove(e: React.PointerEvent) {
    if (!isPaintingRef.current || !drawing || drawing.shapeType !== "PATH" || !containerRef.current) return;
    const { x, y } = clientToPercent(e.clientX, e.clientY);
    const last = lastPaintPointRef.current;
    // Distance-throttled so a slow drag doesn't flood draftPoints with near-duplicate points —
    // 1.2% of canvas width is fine-grained enough to look smooth while keeping point counts sane.
    if (last && Math.hypot(x - last.x, y - last.y) < 1.2) return;
    lastPaintPointRef.current = { x, y };
    setDraftPoints((pts) => [...pts, { x, y }]);
  }
  function handlePathPaintPointerUp() {
    isPaintingRef.current = false;
    lastPaintPointRef.current = null;
  }

  // Repositioning an existing draft point (polygon/path edit) — pointer capture on the point
  // itself routes subsequent move/up events here regardless of where the cursor ends up, same
  // pattern as the marker drag handlers below.
  function startDragDraftPoint(e: React.PointerEvent, index: number) {
    e.stopPropagation();
    (e.target as Element).setPointerCapture(e.pointerId);
    pushDraftHistory();
    setDraggingPointIndex(index);
  }
  function dragDraftPointMove(e: React.PointerEvent) {
    if (draggingPointIndex === null || !containerRef.current) return;
    const { x, y } = clientToPercent(e.clientX, e.clientY);
    setDraftPoints((pts) => pts.map((p, i) => (i === draggingPointIndex ? { x, y } : p)));
  }
  function dragDraftPointUp() {
    setDraggingPointIndex(null);
  }
  function removeDraftPoint(e: React.MouseEvent, index: number) {
    e.stopPropagation();
    pushDraftHistory();
    setDraftPoints((pts) => pts.filter((_, i) => i !== index));
  }

  function finishDrawing() {
    if (!drawing || draftPoints.length < 2) return;
    updatePlacementMutation.mutate({ placementId: drawing.placementId, shapeType: drawing.shapeType, shapeData: { points: draftPoints } });
    setDrawing(null);
    setDraftPoints([]);
    setPastDrafts([]);
    setFutureDrafts([]);
  }

  function cancelDrawing() {
    setDrawing(null);
    setDraftPoints([]);
    setDraftRadius(null);
    setPastDrafts([]);
    setFutureDrafts([]);
  }

  // Loads an already-drawn shape's points/radius into the draft state and re-enters drawing
  // mode — the same circle-resize / point-add/drag/delete handlers used for a brand-new shape
  // work unchanged here, since they only ever operate on draftPoints/draftRadius.
  function startEditingShape(placement: SiteMapPlacement) {
    if (placement.shapeType === "NONE" || !placement.shapeData) return;
    setDrawing({ placementId: placement.id, shapeType: placement.shapeType });
    if ("radius" in placement.shapeData) {
      setDraftRadius(placement.shapeData.radius);
      setDraftPoints([]);
    } else {
      setDraftPoints(placement.shapeData.points);
      setDraftRadius(null);
    }
    setPastDrafts([]);
    setFutureDrafts([]);
    setEditingPlacement(null);
  }

  // Erases the whole shape immediately, from within the drawing toolbar (not just the device
  // panel) — lets a mid-edit user bail out to "no shape" in one click instead of cancelling then
  // reopening the panel to hit Erase Shape there.
  function eraseWholeShape() {
    if (!drawing) return;
    updatePlacementMutation.mutate({ placementId: drawing.placementId, shapeType: "NONE", shapeData: null });
    cancelDrawing();
  }

  function toPx(pct: number, axis: "x" | "y") {
    return axis === "x" ? (pct / 100) * size.width : (pct / 100) * size.height;
  }

  if (!siteMap) {
    return <div className="empty-state">Loading site map...</div>;
  }

  const overlayDensityValue = overlayDraft ?? siteMap.overlayDensity;

  function handleOverlayDensityChange(value: number) {
    setOverlayDraft(value);
    debouncedSaveOverlay(value);
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
              : drawing.shapeType === "PATH"
              ? "Press and drag across the map to paint the coverage path — release to pause, press again to keep extending it."
              : "Click the map to add points. Drag a point to reposition it, double-click to remove it."}
          </span>
          <button className="btn-icon" title="Undo (Ctrl+Z)" disabled={pastDrafts.length === 0} onClick={undoDraft}>
            <Icon name="arrowLeft" size={13} />
          </button>
          <button className="btn-icon" title="Redo (Ctrl+Shift+Z)" disabled={futureDrafts.length === 0} onClick={redoDraft}>
            <Icon name="arrowRight" size={13} />
          </button>
          <button className="btn btn-secondary btn-sm" onClick={eraseWholeShape}>
            <Icon name="trash" size={12} /> Erase Shape
          </button>
          {drawing.shapeType !== "CIRCLE" && (
            <button className="btn btn-primary btn-sm" style={{ marginLeft: "auto" }} disabled={draftPoints.length < 2} onClick={finishDrawing}>Finish</button>
          )}
          <button className="btn btn-secondary btn-sm" style={drawing.shapeType === "CIRCLE" ? { marginLeft: "auto" } : undefined} onClick={cancelDrawing}>Cancel</button>
        </div>
      )}

      <div className="row gap-3" style={{ alignItems: "flex-start" }}>
        <div
          ref={cardRef}
          className="card"
          style={{
            position: "relative",
            padding: 0,
            flex: 1,
            overflow: "hidden",
            height: isFullscreen ? "100vh" : "calc(100vh - 260px)",
            minHeight: 420,
            // Dark blueprint-style grid backdrop — always visible underneath/around the floor plan
            // image, and the only thing visible once zoomed/panned past the image's own edges,
            // so the canvas reads as an infinite surface rather than a fixed photo frame.
            backgroundColor: "var(--color-bg)",
            backgroundImage:
              "linear-gradient(var(--color-border) 1px, transparent 1px), linear-gradient(90deg, var(--color-border) 1px, transparent 1px)",
            backgroundSize: "40px 40px",
          }}
        >
          <div
            ref={setContainerEl}
            style={{
              position: "relative",
              width: "100%",
              height: "100%",
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              transformOrigin: "center center",
              cursor: drawing ? undefined : "grab",
              touchAction: "none",
            }}
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
            onPointerDown={handleCanvasPanPointerDown}
            onPointerMove={(e) => { dragDraftPointMove(e); handleCanvasPanPointerMove(e); }}
            onPointerUp={(e) => { dragDraftPointUp(); handleCanvasPanPointerUp(e); }}
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
              style={{ position: "absolute", inset: 0, cursor: drawing && drawing.shapeType !== "CIRCLE" ? "crosshair" : undefined, touchAction: drawing?.shapeType === "PATH" ? "none" : undefined }}
              onClick={handleCanvasClick}
              onPointerDown={handlePathPaintPointerDown}
              onPointerMove={handlePathPaintPointerMove}
              onPointerUp={handlePathPaintPointerUp}
              onPointerLeave={handlePathPaintPointerUp}
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
              {/* Draggable per-point handles only for POLYGON (zone) — a freehand-painted PATH can
                  easily have hundreds of sampled points, so rendering a handle at every one would
                  be visual noise; fixing a painted stroke is Undo + repaint, not point-nudging. */}
              {drawing && drawing.shapeType === "POLYGON" &&
                draftPoints.map((pt, i) => (
                  <circle
                    key={i}
                    cx={toPx(pt.x, "x")}
                    cy={toPx(pt.y, "y")}
                    r={5}
                    fill="var(--color-primary)"
                    stroke="var(--color-surface)"
                    strokeWidth={1.5}
                    style={{ cursor: "grab", pointerEvents: "auto" }}
                    onPointerDown={(e) => startDragDraftPoint(e, i)}
                    onClick={(e) => e.stopPropagation()}
                    onDoubleClick={(e) => removeDraftPoint(e, i)}
                  />
                ))}

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

              {/* Dark scrim over the whole map, punched through with an animated "cleared" hole
                  over each ON light's own coverage shape (falling back to a small default circle
                  around its marker when it has no drawn shape) — see overlayDensity's schema
                  comment. The mask child elements are always rendered (even for OFF lights, at
                  r=0 / scale(0)) so the CSS transition on r/transform actually has something to
                  animate between renders instead of the hole just popping in and out. */}
              {overlayDensityValue > 0 && (
                <>
                  <defs>
                    <mask id={`sitemap-overlay-mask-${siteMap.id}`} maskUnits="userSpaceOnUse" x={0} y={0} width={size.width} height={size.height}>
                      <rect x={0} y={0} width={size.width} height={size.height} fill="white" />
                      {siteMap.devices.map((p) => {
                        const on = p.device.isOn;
                        const cx = toPx(p.x, "x");
                        const cy = toPx(p.y, "y");
                        if (p.shapeType === "CIRCLE" && p.shapeData && "radius" in p.shapeData) {
                          return (
                            <circle
                              key={`clear-${p.id}`}
                              cx={cx}
                              cy={cy}
                              r={on ? toPx(p.shapeData.radius, "x") : 0}
                              fill="black"
                              style={{ transition: "r 700ms ease" }}
                            />
                          );
                        }
                        if ((p.shapeType === "POLYGON" || p.shapeType === "PATH") && p.shapeData && "points" in p.shapeData) {
                          const pts = p.shapeData.points.map((pt) => `${toPx(pt.x, "x")},${toPx(pt.y, "y")}`).join(" ");
                          return (
                            <g
                              key={`clear-${p.id}`}
                              style={{ transformOrigin: `${cx}px ${cy}px`, transform: on ? "scale(1)" : "scale(0)", transition: "transform 700ms ease" }}
                            >
                              <polygon points={pts} fill="black" />
                            </g>
                          );
                        }
                        return (
                          <circle
                            key={`clear-${p.id}`}
                            cx={cx}
                            cy={cy}
                            r={on ? toPx(DEFAULT_REVEAL_RADIUS_PCT, "x") : 0}
                            fill="black"
                            style={{ transition: "r 700ms ease" }}
                          />
                        );
                      })}
                    </mask>
                  </defs>
                  <rect
                    x={0}
                    y={0}
                    width={size.width}
                    height={size.height}
                    fill="black"
                    fillOpacity={overlayDensityValue / 100}
                    mask={`url(#sitemap-overlay-mask-${siteMap.id})`}
                    style={{ pointerEvents: "none" }}
                  />
                </>
              )}
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
                    onClick={() => handleMarkerClick(p)}
                    title={`${p.device.name} — click to turn ${p.device.isOn ? "off" : "on"}`}
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

          {siteMap.devices.length === 0 && (
            <div
              className="muted"
              style={{
                position: "absolute",
                inset: 0,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                textAlign: "center",
                gap: 4,
                fontSize: 13,
                pointerEvents: "none",
              }}
            >
              <div>No devices placed on this map yet.</div>
              {canEdit && <div style={{ fontSize: 12 }}>Switch to Edit Layout and drag a device onto the map to place it here.</div>}
            </div>
          )}

          <div className="row gap-1" style={{ position: "absolute", right: 12, bottom: 12, alignItems: "center", background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: 8, padding: 3, boxShadow: "0 2px 8px rgba(0,0,0,0.15)" }}>
            <button className="btn-icon" title="Zoom out" onClick={() => setZoom((z) => clamp(z / 1.25, MIN_ZOOM, MAX_ZOOM))}>
              <Icon name="minus" size={14} />
            </button>
            <button className="btn-icon" title="Reset zoom" style={{ fontSize: 11, width: "auto", padding: "0 8px" }} onClick={resetView}>
              {Math.round(zoom * 100)}%
            </button>
            <button className="btn-icon" title="Zoom in" onClick={() => setZoom((z) => clamp(z * 1.25, MIN_ZOOM, MAX_ZOOM))}>
              <Icon name="plus" size={14} />
            </button>
          </div>

          {canEdit && (
            <div
              className="row gap-2"
              style={{
                position: "absolute",
                left: 12,
                bottom: 12,
                alignItems: "center",
                background: "var(--color-surface)",
                border: "1px solid var(--color-border)",
                borderRadius: 8,
                padding: "6px 10px",
                boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
              }}
              title="Dark overlay covers the map; each light clears an animated hole over its own coverage area when switched on."
            >
              <Icon name="moon" size={13} />
              <input
                type="range"
                min={0}
                max={100}
                value={overlayDensityValue}
                onChange={(e) => handleOverlayDensityChange(Number(e.target.value))}
                style={{ width: 90 }}
              />
              <span className="muted" style={{ fontSize: 11, width: 32 }}>{overlayDensityValue}%</span>
            </div>
          )}
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
            setPastDrafts([]);
            setFutureDrafts([]);
            setEditingPlacement(null);
          }}
          onEditShape={() => startEditingShape(editingPlacement)}
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
