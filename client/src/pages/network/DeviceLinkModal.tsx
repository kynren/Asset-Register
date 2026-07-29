import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { axiosClient } from "../../api/axiosClient";
import { FormModal } from "../../components/FormModal";

export function DeviceLinkModal({ device, onClose }: { device: { id: number; hostname: string }; onClose: () => void }) {
  const [assetId, setAssetId] = useState<number | "">("");
  const queryClient = useQueryClient();

  const { data: assets } = useQuery({
    queryKey: ["assets-unlinked"],
    queryFn: async () => (await axiosClient.get("/assets", { params: { pageSize: 200 } })).data.items,
  });

  const mutation = useMutation({
    mutationFn: () => axiosClient.patch(`/assets/${assetId}`, { deviceId: device.id }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["devices"] });
      queryClient.invalidateQueries({ queryKey: ["assets"] });
      onClose();
    },
  });

  return (
    <FormModal
      title={`Link "${device.hostname}" to an Asset`}
      onClose={onClose}
      onSubmit={() => assetId && mutation.mutate()}
      submitting={mutation.isPending}
      submitLabel="Link"
    >
      <div className="field">
        <label>Asset</label>
        <select className="select" value={assetId} onChange={(e) => setAssetId(e.target.value ? Number(e.target.value) : "")}>
          <option value="">Select an asset...</option>
          {assets?.filter((a: any) => !a.device).map((a: any) => (
            <option key={a.id} value={a.id}>{a.assetTag} — {a.name}</option>
          ))}
        </select>
      </div>
    </FormModal>
  );
}
