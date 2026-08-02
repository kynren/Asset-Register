import type { ToastInput } from "../components/toast/ToastProvider";

// Lets code outside the React tree (the QueryClient's MutationCache, configured once at module
// load, before any component mounts) push toasts without importing React context directly.
// ToastProvider registers itself as the listener on mount; nothing happens if it hasn't mounted
// yet (nothing should be pushing toasts before the app renders).
type Listener = (toast: ToastInput) => void;

let listener: Listener | null = null;

export function registerToastListener(fn: Listener): void {
  listener = fn;
}

export function pushToast(toast: ToastInput): void {
  listener?.(toast);
}
