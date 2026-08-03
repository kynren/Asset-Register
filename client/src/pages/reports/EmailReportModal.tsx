import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { axiosClient } from "../../api/axiosClient";
import { FormModal } from "../../components/FormModal";
import { ChipSelect } from "../../components/ChipSelect";
import { Icon } from "../../components/Icon";

function isValidEmail(v: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

export function EmailReportModal({ reportId, reportName, onClose }: { reportId: number; reportName: string; onClose: () => void }) {
  const [recipients, setRecipients] = useState<string[]>([]);
  const [draft, setDraft] = useState("");
  const [format, setFormat] = useState<"pdf" | "csv">("pdf");
  const [message, setMessage] = useState("");
  const [sent, setSent] = useState(false);

  const emailMutation = useMutation({
    mutationFn: () => axiosClient.post(`/reports/${reportId}/email`, { to: recipients, format, message: message.trim() || undefined }),
    meta: { successMessage: "Report emailed" },
    onSuccess: () => setSent(true),
  });

  function addRecipient() {
    const v = draft.trim();
    if (v && isValidEmail(v) && !recipients.includes(v)) {
      setRecipients([...recipients, v]);
      setDraft("");
    }
  }

  const canSend = recipients.length > 0 && !emailMutation.isPending;

  return (
    <FormModal
      title={`Email "${reportName}"`}
      onClose={onClose}
      onSubmit={() => emailMutation.mutate()}
      submitLabel={emailMutation.isPending ? "Sending..." : "Send"}
      submitDisabled={!canSend}
      maxWidth={480}
    >
      {sent && <div className="alert alert-success">Report emailed to {recipients.length} recipient{recipients.length === 1 ? "" : "s"}.</div>}

      <div className="field">
        <label>Recipients</label>
        <div className="row gap-1 flex-wrap" style={{ marginBottom: 6 }}>
          {recipients.map((r) => (
            <span key={r} className="badge badge-neutral row gap-1" style={{ alignItems: "center" }}>
              {r}
              <button type="button" className="btn-icon" style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }} onClick={() => setRecipients(recipients.filter((x) => x !== r))}>
                <Icon name="close" size={10} />
              </button>
            </span>
          ))}
        </div>
        <div className="row gap-2">
          <input
            className="input"
            type="email"
            placeholder="name@company.com"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === ",") {
                e.preventDefault();
                addRecipient();
              }
            }}
          />
          <button type="button" className="btn btn-secondary btn-sm" onClick={addRecipient} disabled={!isValidEmail(draft.trim())}>Add</button>
        </div>
      </div>

      <div className="field">
        <label>Format</label>
        <ChipSelect
          value={format}
          onChange={(v) => setFormat(v as "pdf" | "csv")}
          options={[
            { value: "pdf", label: "PDF" },
            { value: "csv", label: "CSV" },
          ]}
        />
      </div>

      <div className="field">
        <label>Message (optional)</label>
        <textarea className="input" rows={3} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Add a note for the recipient(s)..." />
      </div>
    </FormModal>
  );
}
