import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { axiosClient } from "../../api/axiosClient";
import { FormModal } from "../../components/FormModal";
import { ChipSelect } from "../../components/ChipSelect";

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
        <ChipSelect
          value={String(assetId)}
          onChange={(v) => setAssetId(v ? Number(v) : "")}
          placeholder="Select an asset..."
          options={[
            { value: "", label: "Select an asset..." },
            ...(assets ?? []).filter((a: any) => !a.device).map((a: any) => ({ value: String(a.id), label: `${a.assetTag} — ${a.name}` })),
          ]}
        />
      </div>
    </FormModal>
  );
}
