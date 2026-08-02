import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { Icon } from "../Icon";
import { registerToastListener } from "../../lib/toastBridge";

export type ToastVariant = "success" | "error" | "warning" | "info";

export interface ToastInput {
  variant?: ToastVariant;
  title?: string;
  message: string;
  /** ms before auto-dismiss; 0 = sticky until manually closed. */
  duration?: number;
}

interface ToastItem {
  id: number;
  variant: ToastVariant;
  title?: string;
  message: string;
  duration: number;
}

interface ToastContextValue {
  showToast: (toast: ToastInput) => number;
  dismissToast: (id: number) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);
const DEFAULT_DURATION = 5000;

const VARIANT_META: Record<ToastVariant, { icon: string; color: string; soft: string }> = {
  success: { icon: "check", color: "var(--color-success)", soft: "var(--color-success-soft)" },
  error: { icon: "close", color: "var(--color-danger)", soft: "var(--color-danger-soft)" },
  warning: { icon: "alertTriangle", color: "var(--color-warning)", soft: "var(--color-warning-soft)" },
  info: { icon: "info", color: "var(--color-primary)", soft: "var(--color-primary-soft)" },
};

let nextToastId = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismissToast = useCallback((id: number) => {
    setToasts((ts) => ts.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback((input: ToastInput) => {
    const id = nextToastId++;
    setToasts((ts) => [
      ...ts,
      {
        id,
        variant: input.variant ?? "info",
        title: input.title,
        message: input.message,
        duration: input.duration ?? DEFAULT_DURATION,
      },
    ]);
    return id;
  }, []);

  useEffect(() => {
    registerToastListener(showToast);
    return () => registerToastListener(() => {});
  }, [showToast]);

  return (
    <ToastContext.Provider value={{ showToast, dismissToast }}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismissToast} />
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within a ToastProvider");
  return ctx;
}

function ToastViewport({ toasts, onDismiss }: { toasts: ToastItem[]; onDismiss: (id: number) => void }) {
  if (toasts.length === 0) return null;
  return (
    <div
      style={{
        position: "fixed",
        top: 16,
        right: 16,
        zIndex: 9999,
        display: "flex",
        flexDirection: "column",
        gap: 8,
        width: 340,
        maxWidth: "calc(100vw - 32px)",
        pointerEvents: "none",
      }}
    >
      {toasts.map((t) => (
        <ToastCard key={t.id} toast={t} onDismiss={() => onDismiss(t.id)} />
      ))}
    </div>
  );
}

function ToastCard({ toast, onDismiss }: { toast: ToastItem; onDismiss: () => void }) {
  const meta = VARIANT_META[toast.variant];
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (toast.duration > 0) {
      timerRef.current = setTimeout(onDismiss, toast.duration);
    }
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
    // Re-arm only if this specific toast instance changes, not on every onDismiss identity change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toast.id]);

  return (
    <div
      role="status"
      className="toast-card-enter"
      style={{
        pointerEvents: "auto",
        display: "flex",
        alignItems: "flex-start",
        gap: 10,
        background: "var(--color-surface)",
        border: "1px solid var(--color-border)",
        borderLeft: `3px solid ${meta.color}`,
        borderRadius: 8,
        boxShadow: "var(--shadow-md)",
        padding: "10px 12px",
      }}
    >
      <div
        style={{
          background: meta.soft,
          color: meta.color,
          borderRadius: 999,
          width: 22,
          height: 22,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          marginTop: 1,
        }}
      >
        <Icon name={meta.icon} size={12} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        {toast.title && <div style={{ fontWeight: 600, fontSize: 13, color: "var(--color-text)" }}>{toast.title}</div>}
        <div style={{ fontSize: 12.5, color: "var(--color-text)", opacity: toast.title ? 0.8 : 1, wordBreak: "break-word" }}>{toast.message}</div>
      </div>
      <button
        onClick={onDismiss}
        aria-label="Dismiss"
        style={{ background: "none", border: "none", cursor: "pointer", color: "var(--color-text)", opacity: 0.45, padding: 2, flexShrink: 0 }}
      >
        <Icon name="close" size={12} />
      </button>
    </div>
  );
}
