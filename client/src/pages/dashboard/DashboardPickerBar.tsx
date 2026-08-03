import { useState } from "react";
import { Icon } from "../../components/Icon";
import { ChipSelect } from "../../components/ChipSelect";

export interface DashboardSummary {
  id: number;
  name: string;
  module: string;
  isDefault: boolean;
  isOwner: boolean;
  canEdit: boolean;
  ownerName?: string;
}

export function DashboardPickerBar({
  dashboards,
  activeId,
  onSelect,
  onCreate,
  onRename,
  onSetDefault,
  onDuplicate,
  onDelete,
  onShare,
  onShowSharedWithMe,
  sharedWithMeCount,
}: {
  dashboards: DashboardSummary[];
  activeId: number | null;
  onSelect: (id: number) => void;
  onCreate: (name: string) => void;
  onRename: (name: string) => void;
  onSetDefault: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onShare: () => void;
  onShowSharedWithMe: () => void;
  sharedWithMeCount: number;
}) {
  const [showNewInput, setShowNewInput] = useState(false);
  const [newName, setNewName] = useState("");
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState("");

  const active = dashboards.find((d) => d.id === activeId);
  const ownedCount = dashboards.filter((d) => d.isOwner).length;

  return (
    <div className="row gap-2 flex-wrap" style={{ alignItems: "center" }}>
      <ChipSelect
        style={{ width: "auto", minWidth: 200 }}
        value={activeId != null ? String(activeId) : ""}
        onChange={(v) => onSelect(Number(v))}
        options={dashboards.map((d) => ({
          value: String(d.id),
          label: `${d.name}${d.isDefault ? " ★" : ""}${!d.isOwner ? ` — shared by ${d.ownerName}` : ""}`,
        }))}
      />

      {renaming ? (
        <>
          <input className="input" style={{ width: 160 }} value={renameValue} onChange={(e) => setRenameValue(e.target.value)} autoFocus />
          <button className="btn btn-primary btn-sm" disabled={!renameValue.trim()} onClick={() => { onRename(renameValue.trim()); setRenaming(false); }}>Save</button>
          <button className="btn btn-secondary btn-sm" onClick={() => setRenaming(false)}>Cancel</button>
        </>
      ) : showNewInput ? (
        <>
          <input className="input" style={{ width: 160 }} placeholder="New dashboard name" value={newName} onChange={(e) => setNewName(e.target.value)} autoFocus />
          <button className="btn btn-primary btn-sm" disabled={!newName.trim()} onClick={() => { onCreate(newName.trim()); setNewName(""); setShowNewInput(false); }}>Create</button>
          <button className="btn btn-secondary btn-sm" onClick={() => setShowNewInput(false)}>Cancel</button>
        </>
      ) : (
        <>
          <button className="btn btn-secondary btn-sm" onClick={() => setShowNewInput(true)}>
            <Icon name="plus" size={12} /> New
          </button>
          {active?.isOwner && (
            <>
              <button className="btn btn-secondary btn-sm" onClick={() => { setRenameValue(active.name); setRenaming(true); }}>
                <Icon name="edit" size={12} /> Rename
              </button>
              {!active.isDefault && (
                <button className="btn btn-secondary btn-sm" onClick={onSetDefault}>
                  <Icon name="star" size={12} /> Set as Default
                </button>
              )}
              <button className="btn btn-secondary btn-sm" onClick={onShare}>
                <Icon name="link" size={12} /> Share
              </button>
              {ownedCount > 1 && (
                <button className="btn btn-secondary btn-sm" onClick={onDelete}>
                  <Icon name="trash" size={12} /> Delete
                </button>
              )}
            </>
          )}
          <button className="btn btn-secondary btn-sm" onClick={onDuplicate}>
            <Icon name="paperclip" size={12} /> Duplicate
          </button>
          <button className="btn btn-secondary btn-sm" onClick={onShowSharedWithMe}>
            <Icon name="mail" size={12} /> Shared with Me
            {sharedWithMeCount > 0 && <span className="badge badge-primary" style={{ marginLeft: 6 }}>{sharedWithMeCount}</span>}
          </button>
        </>
      )}
    </div>
  );
}
