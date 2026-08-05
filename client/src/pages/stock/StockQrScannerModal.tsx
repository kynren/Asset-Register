import { useQuery } from "@tanstack/react-query";
import { axiosClient } from "../../api/axiosClient";
import { QrScannerCore } from "../../components/QrScannerCore";

interface StockOption {
  id: number;
  sku: string;
  name: string;
}

export function StockQrScannerModal({ onClose, onFound }: { onClose: () => void; onFound: (stockItemId: number) => void }) {
  const { data: stockOptions } = useQuery({
    queryKey: ["stock-for-scan"],
    queryFn: async () => (await axiosClient.get("/stock", { params: { pageSize: 200 } })).data.items as StockOption[],
  });

  async function handleDecode(sku: string) {
    try {
      const res = await axiosClient.get(`/stock/by-sku/${encodeURIComponent(sku)}`);
      onClose();
      onFound(res.data.id);
      return true;
    } catch {
      return false;
    }
  }

  return (
    <QrScannerCore
      title="STOCK QR SCANNER"
      instructions="Scan a stock item's printed QR label, or pick one above to simulate a scan. A match opens that item's details, current quantity, and issue history."
      simulateLabel="Or simulate a scan"
      simulateOptions={[
        { value: "", label: "-- Select a stock item to simulate scanning its label --" },
        ...(stockOptions ?? []).map((s) => ({ value: s.sku, label: `${s.sku} — ${s.name}` })),
      ]}
      notFoundMessage={(sku) => `No stock item with SKU "${sku}". Retrying scan...`}
      onDecode={handleDecode}
      onClose={onClose}
    />
  );
}
