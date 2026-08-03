import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { axiosClient } from "../../api/axiosClient";
import { Icon } from "../../components/Icon";

interface ContactEmail {
  id: number;
  email: string;
  label: string | null;
  createdAt: string;
}

// Lets a user register additional contact emails (e.g. a personal address, a shared team inbox)
// beyond their one login email — mirrors GLPI's per-user multi-email support. Nothing else in the
// app currently reads these; they're a place to record them for future notification routing.
export function ContactEmailsCard() {
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [label, setLabel] = useState("");

  const { data: emails } = useQuery({
    queryKey: ["my-contact-emails"],
    queryFn: async () => (await axiosClient.get("/profile/contact-emails")).data as ContactEmail[],
  });

  const addMutation = useMutation({
    mutationFn: () => axiosClient.post("/profile/contact-emails", { email, label: label || undefined }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-contact-emails"] });
      setEmail("");
      setLabel("");
    },
  });

  const removeMutation = useMutation({
    mutationFn: (id: number) => axiosClient.delete(`/profile/contact-emails/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["my-contact-emails"] }),
  });

  return (
    <div className="card">
      <h3 className="mt-0">Additional Contact Emails</h3>
      <p className="muted" style={{ fontSize: 12 }}>
        Register other email addresses associated with you (e.g. a personal address or a shared inbox), separate from your login email.
      </p>

      <div className="stack gap-1" style={{ marginBottom: 12 }}>
        {(emails ?? []).map((e) => (
          <div key={e.id} className="row gap-2" style={{ justifyContent: "space-between", fontSize: 13, padding: "6px 0", borderBottom: "1px solid var(--color-border)" }}>
            <span>{e.email}{e.label ? <span className="muted"> — {e.label}</span> : null}</span>
            <button className="btn btn-secondary btn-sm btn-icon" title="Remove" onClick={() => removeMutation.mutate(e.id)}>
              <Icon name="trash" size={12} />
            </button>
          </div>
        ))}
        {!emails?.length && <div className="muted" style={{ fontSize: 12 }}>No additional contact emails yet.</div>}
      </div>

      <div className="row gap-2">
        <input className="input" style={{ flex: 1 }} type="email" placeholder="name@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
        <input className="input" style={{ width: 160 }} placeholder="Label (optional)" value={label} onChange={(e) => setLabel(e.target.value)} />
        <button className="btn btn-secondary btn-sm" disabled={!email.trim() || addMutation.isPending} onClick={() => addMutation.mutate()}>
          <Icon name="plus" size={12} /> Add
        </button>
      </div>
    </div>
  );
}
