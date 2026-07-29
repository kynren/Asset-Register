import { ReactNode } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Icon } from "../../components/Icon";

export function SortableWidget({
  id,
  cols,
  onExpandToggle,
  onRemove,
  children,
}: {
  id: string;
  cols: number;
  onExpandToggle: () => void;
  onRemove: () => void;
  children: ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    gridColumn: `span ${cols}`,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="card widget-card">
      <div className="widget-card-toolbar">
        <button className="widget-drag-handle" {...attributes} {...listeners} title="Drag to reorder">
          <Icon name="grid" size={13} />
        </button>
        <div className="row gap-1">
          <button className="btn btn-secondary btn-sm btn-icon" onClick={onExpandToggle} title="Toggle size">
            <Icon name={cols >= 4 ? "zoomOut" : "zoomIn"} size={12} />
          </button>
          <button className="btn btn-secondary btn-sm btn-icon" onClick={onRemove} title="Remove widget">
            <Icon name="close" size={12} />
          </button>
        </div>
      </div>
      {children}
    </div>
  );
}
