import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { axiosClient } from "../../api/axiosClient";
import { Icon } from "../../components/Icon";
import { PermissionGate } from "../../auth/PermissionGate";
import { LoginPageDesigner } from "./LoginPageDesigner";
import { WATERMARK_POSITION_OPTIONS } from "../../lib/watermarkPosition";

const HEX_COLOR_PATTERN = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

// Native <input type="color"> plus a text field so a known hex code can be typed/pasted in
// directly, rather than only picked from the OS color-swatch dialog. The two stay in sync;
// invalid partial input (mid-typing) is allowed locally but only committed to the shared color
// once it's a valid #rgb/#rrggbb hex, so the swatch and the saved value never see garbage.
function HexColorField({ value, onChange }: { value: string; onChange: (hex: string) => void }) {
  const [text, setText] = useState(value);

  useEffect(() => {
    setText(value);
  }, [value]);

  function handleTextChange(next: string) {
    setText(next);
    if (HEX_COLOR_PATTERN.test(next)) onChange(next);
  }

  return (
    <div className="row gap-2" style={{ alignItems: "center" }}>
      <input className="input" type="color" value={HEX_COLOR_PATTERN.test(text) ? text : value} onChange={(e) => { setText(e.target.value); onChange(e.target.value); }} style={{ height: 36, width: 44, padding: 2, flexShrink: 0 }} />
      <input
        className="input"
        value={text}
        onChange={(e) => handleTextChange(e.target.value)}
        placeholder="#7e14ff"
        maxLength={7}
        style={{ fontFamily: "monospace" }}
      />
    </div>
  );
}

function BrandingUploader({
  type, label, hint, currentUrl, accept = "image/*", onRemove,
}: {
  type: "appIcon" | "favicon" | "docsWatermark";
  label: string;
  hint?: string;
  currentUrl: string | null;
  accept?: string;
  onRemove?: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  const uploadMutation = useMutation({
    mutationFn: (file: File) => {
      const formData = new FormData();
      formData.append("type", type);
      formData.append("file", file);
      return axiosClient.post("/settings/branding", formData, { headers: { "Content-Type": "multipart/form-data" } });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["branding-fields"] });
      queryClient.invalidateQueries({ queryKey: ["branding-public"] });
    },
  });

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) uploadMutation.mutate(file);
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <div className="row gap-3" style={{ alignItems: "center" }}>
      <div style={{ width: 48, height: 48, borderRadius: 8, background: "var(--color-bg)", border: "1px solid var(--color-border)", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
        {currentUrl ? <img src={currentUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "contain" }} /> : <Icon name="admin" size={20} />}
      </div>
      <div className="flex-1">
        <div style={{ fontSize: 13, fontWeight: 600 }}>{label}</div>
        <div className="muted" style={{ fontSize: 11 }}>{hint ?? "PNG, JPEG, or SVG, up to 2MB"}</div>
      </div>
      <input ref={inputRef} type="file" accept={accept} style={{ display: "none" }} onChange={handleChange} />
      <PermissionGate module="branding" action="edit">
        <button className="btn btn-secondary btn-sm" onClick={() => inputRef.current?.click()} disabled={uploadMutation.isPending}>
          {uploadMutation.isPending ? "Uploading..." : "Upload"}
        </button>
        {currentUrl && onRemove && (
          <button className="btn btn-secondary btn-sm" onClick={onRemove}>Remove</button>
        )}
      </PermissionGate>
    </div>
  );
}

export function BrandingTab() {
  const queryClient = useQueryClient();
  const { data: fields } = useQuery({ queryKey: ["branding-fields"], queryFn: async () => (await axiosClient.get("/settings/branding-fields")).data });
  const [values, setValues] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (fields) setValues(fields);
  }, [fields]);

  const saveMutation = useMutation({
    mutationFn: () =>
      axiosClient.put("/settings/branding-fields", {
        companyName: values.companyName,
        brandPrimaryColor: values.brandPrimaryColor,
        brandSecondaryColor: values.brandSecondaryColor,
      }),
    onSuccess: () => {
      setSaved(true);
      queryClient.invalidateQueries({ queryKey: ["branding-fields"] });
      queryClient.invalidateQueries({ queryKey: ["branding-public"] });
      setTimeout(() => setSaved(false), 2000);
    },
  });

  const [watermarkSaved, setWatermarkSaved] = useState(false);
  const watermarkPositionMutation = useMutation({
    mutationFn: (position: string) => axiosClient.put("/settings/branding-fields", { docsWatermarkPosition: position }),
    onSuccess: () => {
      setWatermarkSaved(true);
      queryClient.invalidateQueries({ queryKey: ["branding-fields"] });
      queryClient.invalidateQueries({ queryKey: ["branding-public"] });
      setTimeout(() => setWatermarkSaved(false), 2000);
    },
  });

  const removeWatermarkMutation = useMutation({
    mutationFn: () => axiosClient.delete("/settings/branding/docs-watermark"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["branding-fields"] });
      queryClient.invalidateQueries({ queryKey: ["branding-public"] });
    },
  });

  return (
    <div className="stack gap-3">
      <div className="card" style={{ maxWidth: 480 }}>
        <h3 className="mt-0">App Identity</h3>
        {saved && <div className="alert alert-success">Branding saved.</div>}
        <div className="field">
          <label>Company Name</label>
          <input className="input" value={values.companyName ?? ""} onChange={(e) => setValues((v) => ({ ...v, companyName: e.target.value }))} />
        </div>
        <div className="stack gap-3">
          <BrandingUploader type="appIcon" label="App Icon (sidebar logo)" currentUrl={values.appIconUrl ?? null} />
          <BrandingUploader type="favicon" label="Browser Favicon" currentUrl={values.faviconUrl ?? null} />
        </div>
        <PermissionGate module="branding" action="edit">
          <button className="btn btn-primary mt-3" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
            {saveMutation.isPending ? "Please wait..." : "Save"}
          </button>
        </PermissionGate>
      </div>

      <div className="card" style={{ maxWidth: 480 }}>
        <h3 className="mt-0">Colors</h3>
        <p className="muted" style={{ fontSize: 12, marginTop: -6 }}>Applied app-wide as the primary/secondary theme colors, including on the (signed-out) login page.</p>
        <div className="row gap-3">
          <div className="field" style={{ flex: 1 }}>
            <label>Primary Color</label>
            <HexColorField value={values.brandPrimaryColor ?? "#7e14ff"} onChange={(hex) => setValues((v) => ({ ...v, brandPrimaryColor: hex }))} />
          </div>
          <div className="field" style={{ flex: 1 }}>
            <label>Secondary Color</label>
            <HexColorField value={values.brandSecondaryColor ?? "#14b8a6"} onChange={(hex) => setValues((v) => ({ ...v, brandSecondaryColor: hex }))} />
          </div>
        </div>
        <PermissionGate module="branding" action="edit">
          <button className="btn btn-primary mt-3" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
            {saveMutation.isPending ? "Please wait..." : "Save"}
          </button>
        </PermissionGate>
      </div>

      <div className="card" style={{ maxWidth: 480 }}>
        <h3 className="mt-0">Docs &amp; SOPs Watermark</h3>
        <p className="muted" style={{ fontSize: 12, marginTop: -6 }}>
          Shown as a faint watermark behind every document in Docs &amp; SOPs, and embedded on every page of PDF/Word exports.
        </p>
        {watermarkSaved && <div className="alert alert-success">Watermark position saved.</div>}
        <BrandingUploader
          type="docsWatermark"
          label="Watermark Image"
          hint="PNG or JPEG, up to 2MB — a logo with a light or transparent background works best"
          accept="image/png,image/jpeg"
          currentUrl={values.docsWatermarkUrl ?? null}
          onRemove={() => removeWatermarkMutation.mutate()}
        />
        <div className="field mt-3">
          <label>Position</label>
          <select
            className="input"
            value={values.docsWatermarkPosition ?? "center"}
            onChange={(e) => {
              const position = e.target.value;
              setValues((v) => ({ ...v, docsWatermarkPosition: position }));
              watermarkPositionMutation.mutate(position);
            }}
          >
            {WATERMARK_POSITION_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="card">
        <h3 className="mt-0">Login Page Designer</h3>
        <p className="muted" style={{ fontSize: 12, marginTop: -6 }}>Design the background, layout, and text/icon overlays shown on the sign-in page.</p>
        <LoginPageDesigner />
      </div>
    </div>
  );
}
