import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { axiosClient } from "../../api/axiosClient";
import { QrScannerCore } from "../../components/QrScannerCore";

interface AssetOption {
  id: number;
  assetTag: string;
  name: string;
}

export function QrScannerModal({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();

  const { data: assetOptions } = useQuery({
    queryKey: ["assets-for-scan"],
    queryFn: async () => (await axiosClient.get("/assets", { params: { pageSize: 200 } })).data.items as AssetOption[],
  });

  async function handleDecode(tag: string) {
    try {
      const res = await axiosClient.get(`/assets/by-tag/${encodeURIComponent(tag)}`);
      onClose();
      navigate(`/assets/${res.data.id}`);
      return true;
    } catch {
      return false;
    }
  }

  return (
    <QrScannerCore
      title="ASSET QR SCANNER"
      instructions="Hold an asset's printed QR label up to your camera, or pick one above to simulate a scan. A match opens that asset's detail page automatically."
      simulateLabel="Or simulate a scan"
      simulateOptions={[
        { value: "", label: "-- Select an asset to simulate scanning its label --" },
        ...(assetOptions ?? []).map((a) => ({ value: a.assetTag, label: `${a.assetTag} — ${a.name}` })),
      ]}
      notFoundMessage={(tag) => `No asset with tag "${tag}". Retrying scan...`}
      onDecode={handleDecode}
      onClose={onClose}
    />
  );
}
