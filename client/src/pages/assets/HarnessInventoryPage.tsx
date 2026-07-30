import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { axiosClient } from "../../api/axiosClient";
import { Icon } from "../../components/Icon";
import { PermissionGate } from "../../auth/PermissionGate";
import { AssetFormModal, AssetFormValues } from "./AssetFormModal";
import { HarnessRegisterView } from "./HarnessRegisterView";
import { Asset } from "./AssetListPage";

function toPayload(values: AssetFormValues) {
  return { ...values, nextServiceDate: values.nextServiceDate ? new Date(values.nextServiceDate).toISOString() : null };
}

// Harness is safety/PPE equipment with its own compliance workflow (certification cycles, life
// span, test history) — it gets a fully separate top-level view instead of living as just another
// "Asset Type" chip inside the general Asset Inventory.
export function HarnessInventoryPage() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Asset | null>(null);

  const { data: categories } = useQuery({
    queryKey: ["asset-categories"],
    queryFn: async () => (await axiosClient.get("/asset-categories")).data as { id: number; name: string }[],
  });
  const harnessCategory = categories?.find((c) => c.name === "Harness");

  function invalidateAll() {
    queryClient.invalidateQueries({ queryKey: ["assets-harness-register"] });
  }

  const createMutation = useMutation({
    mutationFn: (values: AssetFormValues) => axiosClient.post("/assets", toPayload(values)),
    onSuccess: () => { invalidateAll(); setShowForm(false); },
  });

  const updateMutation = useMutation({
    mutationFn: (values: AssetFormValues) => axiosClient.patch(`/assets/${editing!.id}`, toPayload(values)),
    onSuccess: () => { invalidateAll(); setEditing(null); },
  });

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Harness Register</h1>
          <p className="page-subtitle">Fall-arrest harness certification, life span, and test history — separate from general IT asset inventory.</p>
        </div>
        <PermissionGate module="assets" action="create">
          <button className="btn btn-primary" disabled={!harnessCategory} onClick={() => setShowForm(true)}>
            <Icon name="plus" size={14} /> Add Harness
          </button>
        </PermissionGate>
      </div>

      {harnessCategory ? (
        <HarnessRegisterView categoryId={harnessCategory.id} onEdit={setEditing} />
      ) : (
        <div className="empty-state">
          No "Harness" category found yet. It's created automatically the first time harness data is imported.
        </div>
      )}

      {showForm && harnessCategory && (
        <AssetFormModal
          initial={{ categoryId: harnessCategory.id }}
          onlyCategoryNames={["Harness"]}
          hideOperationalToggles
          onClose={() => setShowForm(false)}
          onSubmit={(v) => createMutation.mutate(v)}
          submitting={createMutation.isPending}
        />
      )}

      {editing && (
        <AssetFormModal
          assetId={editing.id}
          featuredImageUrl={editing.featuredImageUrl}
          initial={{
            assetTag: editing.assetTag,
            name: editing.name,
            status: editing.status,
            categoryId: editing.categoryId,
            locationId: editing.locationId,
            assignedToId: editing.assignedToId,
            manufacturer: editing.manufacturer ?? "",
            model: editing.model ?? "",
            serialNumber: editing.serialNumber ?? "",
            notes: editing.notes ?? "",
            nextServiceDate: editing.nextServiceDate ? editing.nextServiceDate.slice(0, 10) : "",
            gridPowered: editing.gridPowered,
            remoteManagementEnabled: editing.remoteManagementEnabled,
          }}
          onlyCategoryNames={["Harness"]}
          hideOperationalToggles
          onClose={() => setEditing(null)}
          onSubmit={(v) => updateMutation.mutate(v)}
          submitting={updateMutation.isPending}
        />
      )}
    </div>
  );
}
