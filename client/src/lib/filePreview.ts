// Extension/mimetype-based dispatch shared by the Media Library and Attached Uploads preview
// modals (and the RichTextEditor's media picker) — one place that decides "what kind of file is
// this" so every preview surface renders the right native element instead of guessing per call site.
export type PreviewKind = "image" | "video" | "audio" | "pdf" | "other";

const IMAGE_EXT = ["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "ico", "avif"];
const VIDEO_EXT = ["mp4", "webm", "mov", "avi", "mkv", "m4v"];
const AUDIO_EXT = ["mp3", "wav", "ogg", "m4a", "flac", "aac"];

// `nameOrUrl` just needs a file extension somewhere in it — a full URL, a bare filename, or a
// display label all work as long as they end in ".ext". Mimetype (when known) is trusted first
// since it's exact; extension is the fallback for sources that don't store one (most attached
// uploads don't have a mimeType column).
export function getPreviewKind(mimeType: string | null | undefined, nameOrUrl: string): PreviewKind {
  if (mimeType) {
    if (mimeType.startsWith("image/")) return "image";
    if (mimeType.startsWith("video/")) return "video";
    if (mimeType.startsWith("audio/")) return "audio";
    if (mimeType === "application/pdf") return "pdf";
  }
  const ext = nameOrUrl.split(/[?#]/)[0].split(".").pop()?.toLowerCase() ?? "";
  if (IMAGE_EXT.includes(ext)) return "image";
  if (VIDEO_EXT.includes(ext)) return "video";
  if (AUDIO_EXT.includes(ext)) return "audio";
  if (ext === "pdf") return "pdf";
  return "other";
}
