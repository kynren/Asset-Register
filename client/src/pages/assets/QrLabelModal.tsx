import { QrCodeModal } from "../../components/QrCodeModal";

export function QrLabelModal({ assetTag, name, onClose }: { assetTag: string; name: string; onClose: () => void }) {
  return <QrCodeModal title="Asset QR Label" value={assetTag} label={assetTag} subLabel={name} onClose={onClose} />;
}
