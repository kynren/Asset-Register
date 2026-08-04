import { Icon } from "./Icon";
import { getPreviewKind } from "../lib/filePreview";

// Renders whatever HTML element actually plays/shows a given file — used by both the Media
// Library and Attached Uploads preview modals so "click a file, see it" works uniformly no matter
// which of the app's upload flows it came from. `nameForKind` only needs to carry a real file
// extension (it can be the src URL itself, or a separate filename when src is a blob: URL that has
// none) — see filePreview.ts's getPreviewKind for why.
export function FilePreview({
  src,
  nameForKind,
  mimeType,
  alt,
  maxHeight = 420,
}: {
  src: string;
  nameForKind: string;
  mimeType?: string | null;
  alt?: string;
  maxHeight?: number;
}) {
  const kind = getPreviewKind(mimeType, nameForKind);

  if (kind === "image") {
    return <img src={src} alt={alt ?? nameForKind} style={{ maxWidth: "100%", maxHeight, borderRadius: 8, display: "block", margin: "0 auto" }} />;
  }
  if (kind === "video") {
    return <video src={src} controls style={{ maxWidth: "100%", maxHeight, borderRadius: 8, display: "block", margin: "0 auto" }} />;
  }
  if (kind === "audio") {
    return <audio src={src} controls style={{ width: "100%" }} />;
  }
  if (kind === "pdf") {
    return <iframe src={src} title={alt ?? nameForKind} style={{ width: "100%", height: maxHeight, border: "1px solid var(--color-border)", borderRadius: 8 }} />;
  }
  return (
    <div className="row gap-2" style={{ alignItems: "center", padding: 14, border: "1px dashed var(--color-border)", borderRadius: 8 }}>
      <Icon name="file" size={24} />
      <span className="muted" style={{ fontSize: 12 }}>Preview isn&apos;t available for this file type — use Open/Download to view it.</span>
    </div>
  );
}
