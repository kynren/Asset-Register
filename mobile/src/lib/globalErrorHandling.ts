import { showGlobalToast } from "../components/toast/ToastProvider";

// Catches everything that isn't already handled by a screen's own try/catch or a query/mutation's
// own onError — a render error, a thrown exception outside of React's tree, or an unhandled
// promise rejection would otherwise just silently fail or hard-crash with no feedback at all.

let lastAlertAt = 0;

// A single bad render loop or a promise rejection inside a tight retry loop can otherwise queue
// dozens of toasts back to back — one every couple of seconds is plenty to inform without
// making the app unusable while the underlying issue gets fixed.
function showErrorAlert(title: string, message: string) {
  const now = Date.now();
  if (now - lastAlertAt < 2000) return;
  lastAlertAt = now;
  showGlobalToast({ variant: "error", title, message });
}

function describeError(error: unknown): string {
  if (error instanceof Error) return error.message || error.toString();
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return "An unknown error occurred.";
  }
}

export function installGlobalErrorHandlers(): void {
  const g = globalThis as unknown as { ErrorUtils?: { setGlobalHandler: (cb: (error: unknown, isFatal?: boolean) => void) => void; getGlobalHandler: () => (error: unknown, isFatal?: boolean) => void } };

  if (g.ErrorUtils) {
    const previousHandler = g.ErrorUtils.getGlobalHandler();
    g.ErrorUtils.setGlobalHandler((error, isFatal) => {
      showErrorAlert(isFatal ? "Unexpected Error" : "Something Went Wrong", describeError(error));
      previousHandler?.(error, isFatal);
    });
  }

  // RN's Hermes/JSC runtime doesn't surface unhandled promise rejections to ErrorUtils on its own
  // — this is the same `promise` polyfill RN itself bundles (no extra dependency), just not wired
  // up to anything by default.
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    require("promise/setimmediate/rejection-tracking").enable({
      allRejections: true,
      onUnhandled: (_id: number, error: unknown) => showErrorAlert("Something Went Wrong", describeError(error)),
      onHandled: () => {},
    });
  } catch {
    // Polyfill not present in this RN version — global JS + render-error handlers above still work.
  }
}
