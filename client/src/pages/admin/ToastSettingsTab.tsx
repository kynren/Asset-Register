import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { axiosClient } from "../../api/axiosClient";
import { Icon } from "../../components/Icon";
import { useToast, type ToastVariant } from "../../components/toast/ToastProvider";
import { NOTIFICATION_TYPES } from "../../lib/notificationTypes";

interface ToastSettingItem {
  id: number | null;
  type: string;
  isEnabled: boolean | null;
  variant: ToastVariant | null;
  title: string | null;
}

const VARIANT_OPTIONS: ToastVariant[] = ["info", "success", "warning", "error"];

export function ToastSettingsTab() {
  const { data } = useQuery({
    queryKey: ["toast-settings"],
    queryFn: async () => (await axiosClient.get("/toast-settings")).data as ToastSettingItem[],
  });

  return (
    <div className="card">
      <div style={{ marginBottom: 4 }}>
        <h3 style={{ margin: 0 }}>Toast Designer</h3>
        <p className="muted" style={{ fontSize: 13, marginTop: 4 }}>
          Customize the pop-up toast shown when each notification type arrives while you're active in the app. Disabling a
          type stops it from popping a toast — it still appears in the notification bell either way.
        </p>
      </div>

      <div className="stack gap-2" style={{ marginTop: 16 }}>
        {NOTIFICATION_TYPES.map((info) => {
          const saved = data?.find((s) => s.type === info.type);
          return <ToastSettingRow key={info.type} type={info.type} label={info.label} description={info.description} defaultVariant={info.defaultVariant} saved={saved} />;
        })}
      </div>
    </div>
  );
}

function ToastSettingRow({
  type,
  label,
  description,
  defaultVariant,
  saved,
}: {
  type: string;
  label: string;
  description: string;
  defaultVariant: ToastVariant;
  saved: ToastSettingItem | undefined;
}) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  const [isEnabled, setIsEnabled] = useState(saved?.isEnabled ?? true);
  const [variant, setVariant] = useState<ToastVariant>(saved?.variant ?? defaultVariant);
  const [title, setTitle] = useState(saved?.title ?? "");

  // saved.id is null for a type nobody has customized yet (see toastSettings.routes.ts padding) —
  // treat that the same as "no saved row" rather than diffing against its null placeholder fields,
  // which would otherwise make every never-touched row appear dirty as soon as it renders.
  const hasSavedRow = saved?.id != null;
  const dirty = hasSavedRow
    ? isEnabled !== saved!.isEnabled || variant !== saved!.variant || title !== (saved!.title ?? "")
    : isEnabled !== true || variant !== defaultVariant || title !== "";

  const saveMutation = useMutation({
    mutationFn: () => axiosClient.patch(`/toast-settings/${type}`, { isEnabled, variant, title: title || null }),
    meta: { successMessage: `Saved toast settings for "${label}"` },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["toast-settings"] }),
  });

  return (
    <div className="ad-row-card" style={{ flexDirection: "column", alignItems: "stretch", gap: 10 }}>
      <div className="row gap-2" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div className="ad-row-value">{label}</div>
          <div className="ad-row-label" style={{ textTransform: "none" }}>{description}</div>
        </div>
        <label className="row gap-1" style={{ alignItems: "center", flexShrink: 0 }}>
          <input type="checkbox" checked={isEnabled} onChange={(e) => setIsEnabled(e.target.checked)} />
          <span style={{ fontSize: 12 }}>Enabled</span>
        </label>
      </div>

      <div className="row gap-2" style={{ flexWrap: "wrap", alignItems: "center" }}>
        <div className="field" style={{ margin: 0 }}>
          <label style={{ fontSize: 11 }}>Variant</label>
          <select className="select" value={variant} onChange={(e) => setVariant(e.target.value as ToastVariant)} style={{ width: 130 }}>
            {VARIANT_OPTIONS.map((v) => (
              <option key={v} value={v}>{v.charAt(0).toUpperCase() + v.slice(1)}</option>
            ))}
          </select>
        </div>
        <div className="field" style={{ margin: 0, flex: 1, minWidth: 180 }}>
          <label style={{ fontSize: 11 }}>Title override (optional)</label>
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={label} />
        </div>
        <button
          className="btn btn-secondary btn-sm"
          style={{ alignSelf: "flex-end" }}
          onClick={() => showToast({ variant, title: title || label, message: description })}
        >
          <Icon name="eye" size={12} /> Preview
        </button>
        <button className="btn btn-primary btn-sm" style={{ alignSelf: "flex-end" }} disabled={!dirty || saveMutation.isPending} onClick={() => saveMutation.mutate()}>
          {saveMutation.isPending ? "Saving..." : "Save"}
        </button>
      </div>
    </div>
  );
}
