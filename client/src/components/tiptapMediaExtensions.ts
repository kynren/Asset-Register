import { Node, mergeAttributes } from "@tiptap/core";

// Atom (leaf) nodes so the video/audio/file embeds survive a save → reload → edit round-trip
// through TipTap's schema — an editor.chain().insertContent() of a raw <video>/<audio>/<a> tag
// with no matching Node definition gets silently stripped the next time the HTML is re-parsed.
// Storage is the same client-side base64 data-URI approach the pre-existing image insert already
// uses (see RichTextEditor.tsx's insertImage) — sections are a JSON column with no separate
// server-side attachment record to point at, and no document id exists yet while a new document
// is still being drafted, so this keeps step-embedded media working the same way at create time
// and edit time. Because of that, embeds are capped client-side (see MAX_EMBED_BYTES).

export const VideoEmbed = Node.create({
  name: "videoEmbed",
  group: "block",
  atom: true,
  addAttributes() {
    return {
      src: { default: null, parseHTML: (el) => el.getAttribute("src") },
      fileName: { default: null, parseHTML: (el) => el.getAttribute("data-filename") },
    };
  },
  parseHTML() {
    return [{ tag: "video[data-embed]" }];
  },
  renderHTML({ HTMLAttributes }) {
    return [
      "video",
      mergeAttributes(
        { src: HTMLAttributes.src, "data-filename": HTMLAttributes.fileName },
        { controls: "true", "data-embed": "true", style: "max-width:100%;border-radius:8px;" }
      ),
    ];
  },
});

export const AudioEmbed = Node.create({
  name: "audioEmbed",
  group: "block",
  atom: true,
  addAttributes() {
    return {
      src: { default: null, parseHTML: (el) => el.getAttribute("src") },
      fileName: { default: null, parseHTML: (el) => el.getAttribute("data-filename") },
    };
  },
  parseHTML() {
    return [{ tag: "audio[data-embed]" }];
  },
  renderHTML({ HTMLAttributes }) {
    return [
      "audio",
      mergeAttributes(
        { src: HTMLAttributes.src, "data-filename": HTMLAttributes.fileName },
        { controls: "true", "data-embed": "true", style: "width:100%;" }
      ),
    ];
  },
});

export const FileEmbed = Node.create({
  name: "fileEmbed",
  group: "block",
  atom: true,
  addAttributes() {
    return {
      src: { default: null, parseHTML: (el) => el.getAttribute("href") },
      fileName: { default: "Attachment", parseHTML: (el) => el.getAttribute("download") || el.textContent },
    };
  },
  parseHTML() {
    return [{ tag: "a[data-embed=file]" }];
  },
  renderHTML({ HTMLAttributes }) {
    const fileName = (HTMLAttributes.fileName as string) ?? "Attachment";
    return [
      "a",
      mergeAttributes(
        { href: HTMLAttributes.src, download: fileName },
        { "data-embed": "file", class: "rte-file-chip" }
      ),
      `📎 ${fileName}`,
    ];
  },
});
