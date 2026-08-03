import { useState } from "react";
import { FormModal } from "../../components/FormModal";
import { Icon, ICON_NAMES } from "../../components/Icon";
import { LoginBlock } from "./loginDesignTypes";

interface Props {
  block: LoginBlock;
  onClose: () => void;
  onSave: (patch: Partial<LoginBlock>) => void;
  onDelete: () => void;
}

export function LoginDesignBlockPanel({ block, onClose, onSave, onDelete }: Props) {
  const [text, setText] = useState(block.type === "text" ? block.text : "");
  const [fontSize, setFontSize] = useState(block.type === "text" ? block.fontSize ?? 16 : 16);
  const [textColor, setTextColor] = useState(block.type === "text" ? block.color ?? "#ffffff" : "#ffffff");
  const [bold, setBold] = useState(block.type === "text" ? block.fontWeight === "bold" || block.fontWeight === 700 : false);
  const [icon, setIcon] = useState(block.type === "icon" ? block.icon : "star");
  const [iconSize, setIconSize] = useState(block.type === "icon" ? block.size ?? 32 : 32);
  const [iconColor, setIconColor] = useState(block.type === "icon" ? block.color ?? "#ffffff" : "#ffffff");
  const [imageWidth, setImageWidth] = useState(block.type === "image" ? block.width ?? 120 : 120);

  function handleSave() {
    if (block.type === "text") onSave({ text, fontSize, color: textColor, fontWeight: bold ? "bold" : "normal" });
    else if (block.type === "icon") onSave({ icon, size: iconSize, color: iconColor });
    else onSave({ width: imageWidth });
  }

  const title = block.type === "text" ? "Text Block" : block.type === "icon" ? "Icon Block" : "Image Block";

  return (
    <FormModal title={title} onClose={onClose} onSubmit={handleSave} submitLabel="Save">
      <div className="stack gap-3">
        {block.type === "text" && (
          <>
            <div className="field">
              <label>Text</label>
              <textarea className="input" rows={2} value={text} onChange={(e) => setText(e.target.value)} />
            </div>
            <div className="row gap-3">
              <div className="field" style={{ flex: 1 }}>
                <label>Font Size</label>
                <input className="input" type="number" min={8} max={96} value={fontSize} onChange={(e) => setFontSize(Number(e.target.value))} />
              </div>
              <div className="field" style={{ flex: 1 }}>
                <label>Color</label>
                <input className="input" type="color" value={textColor} onChange={(e) => setTextColor(e.target.value)} style={{ height: 36, padding: 2 }} />
              </div>
            </div>
            <label className="row gap-2" style={{ cursor: "pointer" }}>
              <input type="checkbox" checked={bold} onChange={(e) => setBold(e.target.checked)} />
              Bold
            </label>
          </>
        )}

        {block.type === "icon" && (
          <>
            <div className="field">
              <label>Icon</label>
              <select className="input" value={icon} onChange={(e) => setIcon(e.target.value)}>
                {ICON_NAMES.map((name) => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
            </div>
            <div className="row gap-2" style={{ alignItems: "center" }}>
              <Icon name={icon} size={iconSize} />
            </div>
            <div className="row gap-3">
              <div className="field" style={{ flex: 1 }}>
                <label>Size (px)</label>
                <input className="input" type="number" min={12} max={200} value={iconSize} onChange={(e) => setIconSize(Number(e.target.value))} />
              </div>
              <div className="field" style={{ flex: 1 }}>
                <label>Color</label>
                <input className="input" type="color" value={iconColor} onChange={(e) => setIconColor(e.target.value)} style={{ height: 36, padding: 2 }} />
              </div>
            </div>
          </>
        )}

        {block.type === "image" && (
          <>
            <img src={block.url} alt="" style={{ maxWidth: "100%", maxHeight: 160, borderRadius: 8 }} />
            <div className="field">
              <label>Width (px)</label>
              <input className="input" type="number" min={20} max={600} value={imageWidth} onChange={(e) => setImageWidth(Number(e.target.value))} />
            </div>
          </>
        )}

        <button className="btn btn-danger btn-sm" style={{ alignSelf: "flex-start" }} onClick={onDelete}>
          <Icon name="trash" size={12} /> Remove Block
        </button>
      </div>
    </FormModal>
  );
}
