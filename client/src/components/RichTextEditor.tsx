import { useEffect, useRef } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import { Icon } from "./Icon";

// A WYSIWYG editor for document/SOP body content. Stores its value as HTML (the same shape the
// read-only SectionsView renders via dangerouslySetInnerHTML) rather than markdown/JSON, so
// existing plain-string section values from before this editor existed still render fine —
// they're just HTML without any tags, which is valid HTML.
export function RichTextEditor({
  value,
  onChange,
  placeholder,
  minHeight = 140,
}: {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  minHeight?: number;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3] } }),
      Link.configure({ openOnClick: false, autolink: true }),
      Image,
      Placeholder.configure({ placeholder: placeholder ?? "Start typing…" }),
    ],
    content: value || "",
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
  });

  // If the value is replaced from outside (e.g. switching document type resets all sections),
  // resync the editor without re-emitting onChange to avoid a feedback loop.
  useEffect(() => {
    if (!editor) return;
    if (value !== editor.getHTML()) {
      editor.commands.setContent(value || "", { emitUpdate: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, editor]);

  function insertImage(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        editor?.chain().focus().setImage({ src: reader.result, alt: file.name }).run();
      }
    };
    reader.readAsDataURL(file);
  }

  function promptLink() {
    const previousUrl = editor?.getAttributes("link").href as string | undefined;
    const url = window.prompt("Link URL", previousUrl ?? "https://");
    if (url === null) return;
    if (url === "") {
      editor?.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    editor?.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
  }

  if (!editor) return null;

  return (
    <div className="rte">
      <div className="rte-toolbar">
        <button type="button" className={editor.isActive("bold") ? "active" : ""} title="Bold" onClick={() => editor.chain().focus().toggleBold().run()}><b>B</b></button>
        <button type="button" className={editor.isActive("italic") ? "active" : ""} title="Italic" onClick={() => editor.chain().focus().toggleItalic().run()}><i>I</i></button>
        <button type="button" className={editor.isActive("strike") ? "active" : ""} title="Strikethrough" onClick={() => editor.chain().focus().toggleStrike().run()}><s>S</s></button>
        <span className="rte-divider" />
        <button type="button" className={editor.isActive("heading", { level: 2 }) ? "active" : ""} title="Heading" onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>H2</button>
        <button type="button" className={editor.isActive("heading", { level: 3 }) ? "active" : ""} title="Subheading" onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}>H3</button>
        <span className="rte-divider" />
        <button type="button" className={editor.isActive("bulletList") ? "active" : ""} title="Bullet list" onClick={() => editor.chain().focus().toggleBulletList().run()}>•—</button>
        <button type="button" className={editor.isActive("orderedList") ? "active" : ""} title="Numbered list" onClick={() => editor.chain().focus().toggleOrderedList().run()}>1.</button>
        <button type="button" className={editor.isActive("blockquote") ? "active" : ""} title="Quote" onClick={() => editor.chain().focus().toggleBlockquote().run()}>&ldquo;</button>
        <span className="rte-divider" />
        <button type="button" className={editor.isActive("link") ? "active" : ""} title="Link" onClick={promptLink}><Icon name="link" size={13} /></button>
        <button type="button" title="Insert image" onClick={() => fileInputRef.current?.click()}><Icon name="camera" size={13} /></button>
        <span className="rte-divider" />
        <button type="button" title="Undo" onClick={() => editor.chain().focus().undo().run()}>&#8630;</button>
        <button type="button" title="Redo" onClick={() => editor.chain().focus().redo().run()}>&#8631;</button>
      </div>
      <EditorContent editor={editor} className="rte-content doc-prose" style={{ minHeight }} />
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        style={{ display: "none" }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) insertImage(file);
          if (fileInputRef.current) fileInputRef.current.value = "";
        }}
      />
    </div>
  );
}
