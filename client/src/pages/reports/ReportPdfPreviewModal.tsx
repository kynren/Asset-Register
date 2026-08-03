import { useEffect, useState } from "react";
import { axiosClient } from "../../api/axiosClient";
import { Icon } from "../../components/Icon";

export function ReportPdfPreviewModal({ reportId, reportName, onClose }: { reportId: number; reportName: string; onClose: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let objectUrl: string | null = null;
    axiosClient
      .get(`/reports/${reportId}/preview.pdf`, { responseType: "blob" })
      .then((res) => {
        objectUrl = window.URL.createObjectURL(res.data);
        setUrl(objectUrl);
      })
      .catch(() => setError(true));
    return () => {
      if (objectUrl) window.URL.revokeObjectURL(objectUrl);
    };
  }, [reportId]);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 900, width: "95%", height: "90vh", display: "flex", flexDirection: "column" }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>PDF Preview — {reportName}</h3>
          <button className="modal-close" onClick={onClose}><Icon name="close" size={18} /></button>
        </div>
        <div style={{ flex: 1, minHeight: 0 }}>
          {error ? (
            <div className="empty-state">Couldn't load the PDF preview.</div>
          ) : !url ? (
            <div className="empty-state">Generating preview...</div>
          ) : (
            <iframe title={`${reportName} PDF preview`} src={url} style={{ width: "100%", height: "100%", border: "none", borderRadius: 8 }} />
          )}
        </div>
      </div>
    </div>
  );
}
