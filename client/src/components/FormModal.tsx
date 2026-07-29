import { ReactNode } from "react";
import { Icon } from "./Icon";

interface FormModalProps {
  title: string;
  onClose: () => void;
  onSubmit?: () => void;
  submitLabel?: string;
  submitting?: boolean;
  submitDisabled?: boolean;
  children: ReactNode;
  hideFooter?: boolean;
  maxWidth?: number;
}

export function FormModal({ title, onClose, onSubmit, submitLabel = "Save", submitting, submitDisabled, children, hideFooter, maxWidth }: FormModalProps) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={maxWidth ? { maxWidth } : undefined} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{title}</h3>
          <button className="modal-close" onClick={onClose}>
            <Icon name="close" size={18} />
          </button>
        </div>
        <div>{children}</div>
        {!hideFooter && (
          <div className="modal-footer">
            <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
            {onSubmit && (
              <button className="btn btn-primary" onClick={onSubmit} disabled={submitting || submitDisabled}>
                {submitting ? "Saving..." : submitLabel}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
