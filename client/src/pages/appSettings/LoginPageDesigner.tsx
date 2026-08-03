import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { axiosClient } from "../../api/axiosClient";
import { Icon } from "../../components/Icon";
import { GradientPicker } from "../../components/GradientPicker";
import { PermissionGate } from "../../auth/PermissionGate";
import { LoginFormCard } from "../auth/LoginFormCard";
import { LoginDesignBlockPanel } from "./LoginDesignBlockPanel";
import { DEFAULT_LOGIN_DESIGN, LoginBlock, LoginPageDesignConfig, loginBackgroundCss } from "./loginDesignTypes";

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

function newBlockId() {
  return `b${Date.now()}${Math.round(Math.random() * 1e6)}`;
}

const LAYOUT_PRESETS: { key: LoginPageDesignConfig["layout"]["preset"]; label: string }[] = [
  { key: "CENTERED", label: "Centered" },
  { key: "SPLIT_VERTICAL", label: "Split — Vertical" },
  { key: "SPLIT_HORIZONTAL", label: "Split — Horizontal" },
];

export function LoginPageDesigner() {
  const queryClient = useQueryClient();
  const { data } = useQuery({ queryKey: ["login-design"], queryFn: async () => (await axiosClient.get("/settings/login-design")).data as LoginPageDesignConfig });
  const [config, setConfig] = useState<LoginPageDesignConfig>(DEFAULT_LOGIN_DESIGN);
  const [saved, setSaved] = useState(false);
  const [selectedBlock, setSelectedBlock] = useState<LoginBlock | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ id: string; x: number; y: number; moved: boolean } | null>(null);
  const [, forceRender] = useState(0);

  useEffect(() => {
    if (data) setConfig(data);
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: () => axiosClient.put("/settings/login-design", config),
    onSuccess: () => {
      setSaved(true);
      queryClient.invalidateQueries({ queryKey: ["login-design"] });
      queryClient.invalidateQueries({ queryKey: ["login-design-public"] });
      setTimeout(() => setSaved(false), 2000);
    },
  });

  const uploadImageMutation = useMutation({
    mutationFn: (file: File) => {
      const fd = new FormData();
      fd.append("file", file);
      return axiosClient.post("/settings/login-design/upload-image", fd, { headers: { "Content-Type": "multipart/form-data" } });
    },
    onSuccess: (res) => setConfig((c) => ({ ...c, background: { type: "image", url: res.data.url } })),
  });

  const uploadVideoMutation = useMutation({
    mutationFn: (file: File) => {
      const fd = new FormData();
      fd.append("file", file);
      return axiosClient.post("/settings/login-design/upload-video", fd, { headers: { "Content-Type": "multipart/form-data" } });
    },
    onSuccess: (res) => setConfig((c) => ({ ...c, background: { type: "video", url: res.data.url } })),
  });

  const uploadBlockImageMutation = useMutation({
    mutationFn: (file: File) => {
      const fd = new FormData();
      fd.append("file", file);
      return axiosClient.post("/settings/login-design/upload-image", fd, { headers: { "Content-Type": "multipart/form-data" } });
    },
    onSuccess: (res) => addBlock({ id: newBlockId(), type: "image", x: 50, y: 50, url: res.data.url, width: 120 }),
  });

  function setBackgroundType(type: LoginPageDesignConfig["background"]["type"]) {
    setConfig((c) => {
      if (type === "color") return { ...c, background: c.background.type === "color" ? c.background : { type: "color", color: "#0f172a" } };
      if (type === "gradient") return { ...c, background: c.background.type === "gradient" ? c.background : { type: "gradient", from: "#7e14ff", to: "#14b8a6", angle: 135 } };
      if (type === "image") return { ...c, background: c.background.type === "image" ? c.background : { type: "image", url: "" } };
      return { ...c, background: c.background.type === "video" ? c.background : { type: "video", url: "" } };
    });
  }

  function setLayoutPreset(preset: LoginPageDesignConfig["layout"]["preset"]) {
    setConfig((c) => ({ ...c, layout: { ...c.layout, preset } }));
  }

  function addBlock(block: LoginBlock) {
    setConfig((c) => ({ ...c, blocks: [...c.blocks, block] }));
  }

  function updateBlock(id: string, patch: Partial<LoginBlock>) {
    setConfig((c) => ({ ...c, blocks: c.blocks.map((b) => (b.id === id ? ({ ...b, ...patch } as LoginBlock) : b)) }));
  }

  function removeBlock(id: string) {
    setConfig((c) => ({ ...c, blocks: c.blocks.filter((b) => b.id !== id) }));
  }

  function clientToPercent(clientX: number, clientY: number) {
    const rect = containerRef.current!.getBoundingClientRect();
    return { x: clamp(((clientX - rect.left) / rect.width) * 100, 0, 100), y: clamp(((clientY - rect.top) / rect.height) * 100, 0, 100) };
  }

  function handlePointerDown(e: React.PointerEvent, block: LoginBlock) {
    e.stopPropagation();
    (e.target as Element).setPointerCapture(e.pointerId);
    dragRef.current = { id: block.id, x: block.x, y: block.y, moved: false };
  }

  function handlePointerMove(e: React.PointerEvent, block: LoginBlock) {
    if (!dragRef.current || dragRef.current.id !== block.id || !containerRef.current) return;
    const { x, y } = clientToPercent(e.clientX, e.clientY);
    dragRef.current = { id: block.id, x, y, moved: true };
    forceRender((n) => n + 1);
  }

  function handlePointerUp(_e: React.PointerEvent, block: LoginBlock) {
    const drag = dragRef.current;
    if (!drag || drag.id !== block.id) return;
    if (drag.moved) {
      updateBlock(block.id, { x: drag.x, y: drag.y } as Partial<LoginBlock>);
    } else {
      setSelectedBlock(block);
    }
    dragRef.current = null;
    forceRender((n) => n + 1);
  }

  const previewBackground =
    config.background.type === "image" || config.background.type === "video" ? "var(--color-bg)" : loginBackgroundCss(config.background);

  const isSplit = config.layout.preset !== "CENTERED";
  const flexDirection: "row" | "column" = config.layout.preset === "SPLIT_HORIZONTAL" ? "column" : "row";
  const formFirst = config.layout.formSide !== "end";

  return (
    <div className="stack gap-3">
      {saved && <div className="alert alert-success">Login page design saved.</div>}

      <div className="row gap-3 flex-wrap">
        <div className="field" style={{ minWidth: 200 }}>
          <label>Background</label>
          <div className="row gap-1">
            {(["color", "gradient", "image", "video"] as const).map((t) => (
              <button key={t} className={`btn btn-sm ${config.background.type === t ? "btn-primary" : "btn-secondary"}`} onClick={() => setBackgroundType(t)}>
                {t[0].toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>
        </div>
        <div className="field" style={{ minWidth: 260 }}>
          <label>Layout</label>
          <div className="row gap-1">
            {LAYOUT_PRESETS.map((p) => (
              <button key={p.key} className={`btn btn-sm ${config.layout.preset === p.key ? "btn-primary" : "btn-secondary"}`} onClick={() => setLayoutPreset(p.key)}>
                {p.label}
              </button>
            ))}
          </div>
        </div>
        {isSplit && (
          <div className="field">
            <label>Form Side</label>
            <div className="row gap-1">
              <button className={`btn btn-sm ${formFirst ? "btn-primary" : "btn-secondary"}`} onClick={() => setConfig((c) => ({ ...c, layout: { ...c.layout, formSide: "start" } }))}>First</button>
              <button className={`btn btn-sm ${!formFirst ? "btn-primary" : "btn-secondary"}`} onClick={() => setConfig((c) => ({ ...c, layout: { ...c.layout, formSide: "end" } }))}>Second</button>
            </div>
          </div>
        )}
      </div>

      {config.background.type === "color" && (
        <div className="field" style={{ maxWidth: 200 }}>
          <input className="input" type="color" value={config.background.color.startsWith("#") ? config.background.color : "#0f172a"} onChange={(e) => setConfig((c) => ({ ...c, background: { type: "color", color: e.target.value } }))} style={{ height: 36, padding: 2 }} />
        </div>
      )}
      {config.background.type === "gradient" && (
        <GradientPicker value={{ from: config.background.from, to: config.background.to, angle: config.background.angle }} onChange={(v) => setConfig((c) => ({ ...c, background: { type: "gradient", ...v } }))} />
      )}
      {config.background.type === "image" && (
        <div className="row gap-2" style={{ alignItems: "center" }}>
          <input type="file" accept="image/*" onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadImageMutation.mutate(f); }} />
          {uploadImageMutation.isPending && <span className="muted" style={{ fontSize: 12 }}>Uploading...</span>}
        </div>
      )}
      {config.background.type === "video" && (
        <div className="row gap-2" style={{ alignItems: "center" }}>
          <input type="file" accept="video/mp4" onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadVideoMutation.mutate(f); }} />
          {uploadVideoMutation.isPending && <span className="muted" style={{ fontSize: 12 }}>Uploading...</span>}
        </div>
      )}

      <div className="row gap-2">
        <button className="btn btn-secondary btn-sm" onClick={() => addBlock({ id: newBlockId(), type: "text", x: 50, y: 15, text: "Welcome", fontSize: 28, color: "#ffffff", fontWeight: "bold" })}>
          <Icon name="plus" size={12} /> Add Text
        </button>
        <button className="btn btn-secondary btn-sm" onClick={() => addBlock({ id: newBlockId(), type: "icon", x: 50, y: 30, icon: "star", size: 40, color: "#ffffff" })}>
          <Icon name="plus" size={12} /> Add Icon
        </button>
        <label className="btn btn-secondary btn-sm" style={{ cursor: "pointer" }}>
          <Icon name="plus" size={12} /> Add Image
          <input type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadBlockImageMutation.mutate(f); }} />
        </label>
      </div>

      <div
        ref={containerRef}
        style={{
          position: "relative",
          height: 360,
          borderRadius: 12,
          overflow: "hidden",
          background: previewBackground,
          border: "1px solid var(--color-border)",
        }}
      >
        {config.background.type === "image" && config.background.url && (
          <img src={config.background.url} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
        )}
        {config.background.type === "video" && config.background.url && (
          <video src={config.background.url} autoPlay muted loop style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
        )}

        <div style={{ position: "relative", height: "100%", display: "flex", flexDirection, alignItems: "center", justifyContent: isSplit ? "space-around" : "center" }}>
          {formFirst && (
            <div style={{ transform: "scale(0.62)", pointerEvents: "none" }}>
              <LoginFormCard />
            </div>
          )}
          {isSplit && <div style={{ flex: 1 }} />}
          {!formFirst && (
            <div style={{ transform: "scale(0.62)", pointerEvents: "none" }}>
              <LoginFormCard />
            </div>
          )}
        </div>

        <div style={{ position: "absolute", inset: 0 }}>
          {config.blocks.map((b) => {
            const dragged = dragRef.current?.id === b.id ? dragRef.current : null;
            const left = dragged ? dragged.x : b.x;
            const top = dragged ? dragged.y : b.y;
            return (
              <div
                key={b.id}
                onPointerDown={(e) => handlePointerDown(e, b)}
                onPointerMove={(e) => handlePointerMove(e, b)}
                onPointerUp={(e) => handlePointerUp(e, b)}
                title="Drag to reposition, click to edit"
                style={{
                  position: "absolute",
                  left: `${left}%`,
                  top: `${top}%`,
                  transform: "translate(-50%, -50%)",
                  cursor: "grab",
                  userSelect: "none",
                  outline: "1px dashed rgba(255,255,255,0.4)",
                  padding: 2,
                }}
              >
                {b.type === "text" && <span style={{ fontSize: b.fontSize ?? 16, color: b.color ?? "#fff", fontWeight: b.fontWeight ?? "normal", whiteSpace: "nowrap" }}>{b.text}</span>}
                {b.type === "icon" && <Icon name={b.icon} size={b.size ?? 32} />}
                {b.type === "image" && <img src={b.url} alt="" style={{ width: b.width ?? 120, display: "block" }} />}
              </div>
            );
          })}
        </div>
      </div>

      <PermissionGate module="branding" action="edit">
        <button className="btn btn-primary" style={{ alignSelf: "flex-start" }} onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
          {saveMutation.isPending ? "Please wait..." : "Save"}
        </button>
      </PermissionGate>

      {selectedBlock && (
        <LoginDesignBlockPanel
          block={config.blocks.find((b) => b.id === selectedBlock.id) ?? selectedBlock}
          onClose={() => setSelectedBlock(null)}
          onSave={(patch) => { updateBlock(selectedBlock.id, patch); setSelectedBlock(null); }}
          onDelete={() => { removeBlock(selectedBlock.id); setSelectedBlock(null); }}
        />
      )}
    </div>
  );
}
