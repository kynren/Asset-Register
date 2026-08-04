import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { axiosClient } from "../../api/axiosClient";
import { PermissionGate } from "../../auth/PermissionGate";

// Docs-scoped setting (not the generic /settings key/value store) because the docs module's edit
// permission is held by both Super Admin (Admin & Setup) and System Admin (App Settings), whereas
// the app-settings module is System-Admin-only — see docs.controller.ts's getImportSettings/
// updateImportSettings. Rendered from both admin screens against the same route, so it always
// reflects (and edits) the one org-wide value regardless of which screen it was opened from.
export function DocsImportLimitCard() {
  const queryClient = useQueryClient();
  const { data } = useQuery({
    queryKey: ["docs-import-settings"],
    queryFn: async () => (await axiosClient.get("/docs/import-settings")).data as { maxFiles: number },
  });
  const [maxFiles, setMaxFiles] = useState("5");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (data) setMaxFiles(String(data.maxFiles));
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: () => axiosClient.put("/docs/import-settings", { maxFiles: Number(maxFiles) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["docs-import-settings"] });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    },
  });

  return (
    <div className="card" style={{ maxWidth: 480 }}>
      <h3 className="mt-0">Docs &amp; SOPs Import Limit</h3>
      <p className="muted" style={{ fontSize: 12, marginTop: -6 }}>
        Maximum number of files a user can upload in one go with the Import Docs wizard.
      </p>
      {saved && <div className="alert alert-success">Saved.</div>}
      <div className="field">
        <label>Max Files per Import</label>
        <input
          className="input"
          type="number"
          min={1}
          max={50}
          value={maxFiles}
          onChange={(e) => setMaxFiles(e.target.value)}
        />
      </div>
      <PermissionGate module="docs" action="edit">
        <button className="btn btn-primary" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
          {saveMutation.isPending ? "Saving..." : "Save"}
        </button>
      </PermissionGate>
    </div>
  );
}
