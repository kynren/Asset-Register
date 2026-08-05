import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { axiosClient } from "../../api/axiosClient";

interface IntakeField {
  id: number;
  label: string;
  fieldKey: string;
  fieldType: "TEXT" | "TEXTAREA" | "NUMBER" | "DATE" | "SELECT" | "CHECKBOX";
  required: boolean;
  options: string[] | null;
}

interface IntakeSchema {
  categoryName: string;
  fields: IntakeField[];
  captchaQuestion: string;
  captchaToken: string;
}

// Public, unauthenticated form — reachable only via a per-category token an admin generated (see
// AssetCategoriesTable.tsx's Public Intake Form toggle). Submissions never write an Asset directly;
// they land in the review queue at /asset-intake for staff to approve or reject.
export function AssetIntakeFormPage() {
  const { token } = useParams<{ token: string }>();
  const [schema, setSchema] = useState<IntakeSchema | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [name, setName] = useState("");
  const [submitterName, setSubmitterName] = useState("");
  const [submitterEmail, setSubmitterEmail] = useState("");
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
  const [captchaAnswer, setCaptchaAnswer] = useState("");

  useEffect(() => {
    if (!token) return;
    axiosClient
      .get(`/public/asset-intake/${token}`)
      .then((res) => setSchema(res.data))
      .catch((err) => setLoadError(err?.response?.data?.error ?? "This intake link is not available."));
  }, [token]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!schema || !token) return;
    setSubmitting(true);
    setSubmitError(null);
    axiosClient
      .post(`/public/asset-intake/${token}`, {
        name,
        submitterName: submitterName || undefined,
        submitterEmail: submitterEmail || undefined,
        fieldValues,
        captchaToken: schema.captchaToken,
        captchaAnswer: Number(captchaAnswer),
      })
      .then(() => setSubmitted(true))
      .catch((err) => setSubmitError(err?.response?.data?.error ?? "Something went wrong. Please try again."))
      .finally(() => setSubmitting(false));
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--color-bg)", padding: 20 }}>
      <div className="card" style={{ maxWidth: 520, width: "100%" }}>
        {loadError ? (
          <div className="alert alert-danger">{loadError}</div>
        ) : !schema ? (
          <div className="muted">Loading form...</div>
        ) : submitted ? (
          <div style={{ textAlign: "center", padding: "20px 0" }}>
            <h2 className="mt-0">Thank you</h2>
            <p className="muted">Your submission has been received and will be reviewed shortly.</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <h2 className="mt-0" style={{ marginBottom: 4 }}>New {schema.categoryName}</h2>
            <p className="muted" style={{ fontSize: 13, marginTop: 0, marginBottom: 18 }}>
              Fill out this form to propose a new {schema.categoryName.toLowerCase()} entry. It will be reviewed before being added.
            </p>
            {submitError && <div className="alert alert-danger" style={{ marginBottom: 12 }}>{submitError}</div>}

            <div className="field">
              <label>Name *</label>
              <input className="input" required value={name} onChange={(e) => setName(e.target.value)} />
            </div>

            {schema.fields.map((f) => (
              <div className="field" key={f.id}>
                <label>{f.label}{f.required ? " *" : ""}</label>
                {f.fieldType === "TEXTAREA" ? (
                  <textarea
                    className="input"
                    rows={3}
                    required={f.required}
                    value={fieldValues[f.fieldKey] ?? ""}
                    onChange={(e) => setFieldValues((prev) => ({ ...prev, [f.fieldKey]: e.target.value }))}
                  />
                ) : f.fieldType === "SELECT" ? (
                  <select
                    className="input"
                    required={f.required}
                    value={fieldValues[f.fieldKey] ?? ""}
                    onChange={(e) => setFieldValues((prev) => ({ ...prev, [f.fieldKey]: e.target.value }))}
                  >
                    <option value="">Select...</option>
                    {(f.options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                ) : f.fieldType === "CHECKBOX" ? (
                  <input
                    type="checkbox"
                    checked={fieldValues[f.fieldKey] === "true"}
                    onChange={(e) => setFieldValues((prev) => ({ ...prev, [f.fieldKey]: e.target.checked ? "true" : "false" }))}
                  />
                ) : (
                  <input
                    className="input"
                    type={f.fieldType === "NUMBER" ? "number" : f.fieldType === "DATE" ? "date" : "text"}
                    required={f.required}
                    value={fieldValues[f.fieldKey] ?? ""}
                    onChange={(e) => setFieldValues((prev) => ({ ...prev, [f.fieldKey]: e.target.value }))}
                  />
                )}
              </div>
            ))}

            <div className="field">
              <label>Your name (optional)</label>
              <input className="input" value={submitterName} onChange={(e) => setSubmitterName(e.target.value)} />
            </div>
            <div className="field">
              <label>Your email (optional)</label>
              <input className="input" type="email" value={submitterEmail} onChange={(e) => setSubmitterEmail(e.target.value)} />
            </div>

            <div className="field">
              <label>{schema.captchaQuestion} *</label>
              <input className="input" required type="number" value={captchaAnswer} onChange={(e) => setCaptchaAnswer(e.target.value)} />
            </div>

            <button className="btn btn-primary" type="submit" disabled={submitting} style={{ width: "100%", marginTop: 8 }}>
              {submitting ? "Submitting..." : "Submit"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
