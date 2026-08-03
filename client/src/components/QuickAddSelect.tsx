import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { axiosClient } from "../api/axiosClient";
import { Icon } from "./Icon";
import { usePermission } from "../auth/PermissionGate";
import { ChipSelect } from "./ChipSelect";

interface Option {
  id: number;
  name: string;
}

export function QuickAddSelect({
  label,
  required,
  value,
  onChange,
  options,
  createUrl,
  queryKey,
}: {
  label: string;
  required?: boolean;
  value: number | null;
  onChange: (id: number | null) => void;
  options: Option[] | undefined;
  createUrl: string;
  queryKey: string;
}) {
  const queryClient = useQueryClient();
  const canCreate = usePermission("admin", "create");
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");

  const createMutation = useMutation({
    mutationFn: (name: string) => axiosClient.post(createUrl, { name }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: [queryKey] });
      onChange(res.data.id);
      setAdding(false);
      setNewName("");
    },
  });

  return (
    <div className="field">
      <div className="field-label-row">
        <label>{label}{required ? " *" : ""}</label>
        {canCreate && (
          <button type="button" className="field-add-btn" title={`Add new ${label.toLowerCase()}`} onClick={() => setAdding((v) => !v)}>
            <Icon name="plus" size={12} />
          </button>
        )}
      </div>
      <ChipSelect
        value={value != null ? String(value) : ""}
        onChange={(v) => onChange(v ? Number(v) : null)}
        placeholder={`Select ${label.toLowerCase()}...`}
        options={[
          { value: "", label: `Select ${label.toLowerCase()}...` },
          ...(options ?? []).map((o) => ({ value: String(o.id), label: o.name })),
        ]}
      />
      {adding && (
        <div className="field-quick-add-row">
          <input
            className="input"
            placeholder={`New ${label.toLowerCase()} name`}
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && newName.trim()) createMutation.mutate(newName.trim()); }}
          />
          <button type="button" className="btn btn-primary btn-sm" disabled={!newName.trim() || createMutation.isPending} onClick={() => createMutation.mutate(newName.trim())}>
            <Icon name="check" size={12} />
          </button>
        </div>
      )}
    </div>
  );
}
