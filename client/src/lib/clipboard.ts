import { pushToast } from "./toastBridge";

// Central place for "copy something to the clipboard" so every call site gets the same
// success/failure toast without re-wiring useToast() in components that don't otherwise need it —
// pushToast works even outside the React tree, same reasoning as toastBridge.ts itself.
export async function copyToClipboard(text: string, successMessage = "Copied to clipboard"): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    pushToast({ variant: "success", message: successMessage });
    return true;
  } catch {
    pushToast({ variant: "error", message: "Couldn't copy to clipboard" });
    return false;
  }
}
