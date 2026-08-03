import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import dayjs from "dayjs";
import { axiosClient } from "../../api/axiosClient";
import { PasswordInput } from "../../components/PasswordInput";
import { PermissionGate } from "../../auth/PermissionGate";
import { ChipSelect } from "../../components/ChipSelect";

interface EmailIngestSettings {
  id: number;
  isEnabled: boolean;
  imapHost: string | null;
  imapPort: number | null;
  imapUser: string | null;
  mailbox: string;
  fallbackRequesterId: number | null;
  defaultCategoryId: number | null;
  lastUid: number | null;
  lastPolledAt: string | null;
  lastError: string | null;
}

export function EmailIngestSettingsTab() {
  const queryClient = useQueryClient();
  const [values, setValues] = useState<Partial<EmailIngestSettings> & { imapPassword?: string }>({});

  const { data: settings } = useQuery({
    queryKey: ["email-ingest-settings"],
    queryFn: async () => (await axiosClient.get("/email-ingest-settings")).data as EmailIngestSettings,
  });
  const { data: users } = useQuery({
    queryKey: ["users-directory"],
    queryFn: async () => (await axiosClient.get("/users/directory")).data,
  });
  const { data: categories } = useQuery({
    queryKey: ["ticket-categories"],
    queryFn: async () => (await axiosClient.get("/ticket-categories")).data,
  });

  useEffect(() => {
    if (settings) setValues((v) => ({ ...settings, imapPassword: v.imapPassword }));
  }, [settings]);

  const saveMutation = useMutation({
    mutationFn: () =>
      axiosClient.put("/email-ingest-settings", {
        isEnabled: values.isEnabled ?? false,
        imapHost: values.imapHost || null,
        imapPort: values.imapPort ?? 993,
        imapUser: values.imapUser || null,
        imapPassword: values.imapPassword || undefined,
        mailbox: values.mailbox || "INBOX",
        fallbackRequesterId: values.fallbackRequesterId ?? null,
        defaultCategoryId: values.defaultCategoryId ?? null,
      }),
    meta: { successMessage: "Email ingestion settings saved" },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["email-ingest-settings"] });
      setValues((v) => ({ ...v, imapPassword: "" }));
    },
  });

  function update<K extends keyof typeof values>(key: K, value: (typeof values)[K]) {
    setValues((v) => ({ ...v, [key]: value }));
  }

  if (!settings) return <p className="muted">Loading...</p>;

  return (
    <div className="card" style={{ maxWidth: 640 }}>
      <h3 className="mt-0">Email Ingestion</h3>
      <p className="muted" style={{ marginTop: -6 }}>
        Turn inbound emails to a dedicated support mailbox into Helpdesk tickets automatically. This organization's
        server polls the mailbox every couple of minutes — no code or webhook setup needed on your side.
      </p>

      <label className="row gap-2" style={{ cursor: "pointer", alignItems: "center", marginBottom: 12 }}>
        <input type="checkbox" checked={values.isEnabled ?? false} onChange={(e) => update("isEnabled", e.target.checked)} />
        Enabled
      </label>

      <div className="grid grid-cols-2">
        <div className="field"><label>IMAP Host</label><input className="input" value={values.imapHost ?? ""} onChange={(e) => update("imapHost", e.target.value)} placeholder="imap.example.com" /></div>
        <div className="field"><label>IMAP Port</label><input className="input" type="number" value={values.imapPort ?? 993} onChange={(e) => update("imapPort", Number(e.target.value))} /></div>
        <div className="field"><label>IMAP User</label><input className="input" value={values.imapUser ?? ""} onChange={(e) => update("imapUser", e.target.value)} placeholder="support@example.com" /></div>
        <div className="field">
          <label>IMAP Password <span className="muted">(leave blank to keep current)</span></label>
          <PasswordInput value={values.imapPassword ?? ""} onChange={(e) => update("imapPassword", e.target.value)} placeholder="••••••••" />
        </div>
        <div className="field"><label>Mailbox</label><input className="input" value={values.mailbox ?? "INBOX"} onChange={(e) => update("mailbox", e.target.value)} /></div>
        <div className="field">
          <label>Fallback Requester <span className="muted">(unrecognized senders)</span></label>
          <ChipSelect
            value={String(values.fallbackRequesterId ?? "")}
            onChange={(v) => update("fallbackRequesterId", v ? Number(v) : null)}
            placeholder="None — skip unrecognized senders"
            options={[{ value: "", label: "None — skip unrecognized senders" }, ...(users ?? []).map((u: any) => ({ value: String(u.id), label: `${u.firstName} ${u.lastName}` }))]}
          />
        </div>
        <div className="field">
          <label>Default Category</label>
          <ChipSelect
            value={String(values.defaultCategoryId ?? "")}
            onChange={(v) => update("defaultCategoryId", v ? Number(v) : null)}
            placeholder="—"
            options={[{ value: "", label: "—" }, ...(categories ?? []).map((c: any) => ({ value: String(c.id), label: c.name }))]}
          />
        </div>
      </div>

      <div className="stack gap-1" style={{ fontSize: 12, marginTop: 8 }}>
        <div className="muted">Last polled: {settings.lastPolledAt ? dayjs(settings.lastPolledAt).format("DD MMM YYYY, HH:mm:ss") : "never"}</div>
        {settings.lastError && <div className="alert alert-danger" style={{ fontSize: 12 }}>{settings.lastError}</div>}
      </div>

      <PermissionGate module="admin" action="edit">
        <button className="btn btn-primary btn-sm" style={{ marginTop: 12 }} disabled={saveMutation.isPending} onClick={() => saveMutation.mutate()}>
          {saveMutation.isPending ? "Saving..." : "Save"}
        </button>
      </PermissionGate>
    </div>
  );
}
