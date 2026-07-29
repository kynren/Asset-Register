import { useRef, useState } from "react";
import { axiosClient } from "../api/axiosClient";
import { Icon } from "./Icon";

export function CsvExportButton({ url, filename }: { url: string; filename: string }) {
  const [loading, setLoading] = useState(false);

  async function handleExport() {
    setLoading(true);
    try {
      const res = await axiosClient.get(url, { responseType: "blob" });
      const blobUrl = window.URL.createObjectURL(res.data);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = filename;
      a.click();
      window.URL.revokeObjectURL(blobUrl);
    } finally {
      setLoading(false);
    }
  }

  return (
    <button className="btn btn-secondary" onClick={handleExport} disabled={loading}>
      <Icon name="download" size={14} /> {loading ? "Exporting..." : "Export CSV"}
    </button>
  );
}

export function CsvImportButton({ url, onImported }: { url: string; onImported: (result: { created: number; errors: string[] }) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await axiosClient.post(url, formData, { headers: { "Content-Type": "multipart/form-data" } });
      onImported(res.data);
    } finally {
      setLoading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <>
      <input ref={inputRef} type="file" accept=".csv" style={{ display: "none" }} onChange={handleFile} />
      <button className="btn btn-secondary" onClick={() => inputRef.current?.click()} disabled={loading}>
        <Icon name="upload" size={14} /> {loading ? "Importing..." : "Import CSV"}
      </button>
    </>
  );
}
