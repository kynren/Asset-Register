import { MutationCache, QueryClient } from "@tanstack/react-query";
import { pushToast } from "./toastBridge";

// Every server error response is shaped { error: string } (see server/src/middleware/errorHandler.ts) —
// falls back to axios's own message, then a generic string, if the response doesn't match that shape
// (e.g. a network failure with no response at all).
function extractErrorMessage(error: unknown): string {
  const anyErr = error as { response?: { data?: { error?: string } }; message?: string };
  return anyErr?.response?.data?.error || anyErr?.message || "Something went wrong.";
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
  // Gives every mutation app-wide an automatic error toast with zero per-call-site changes — a
  // mutation opts out via `meta: { suppressErrorToast: true }` when it already renders its own
  // inline error (e.g. a login form). Success toasts stay opt-in via `meta: { successMessage }`
  // since, unlike errors, there's no generic success text worth guessing.
  mutationCache: new MutationCache({
    onError: (error, _variables, _context, mutation) => {
      if (mutation.meta?.suppressErrorToast) return;
      pushToast({
        variant: "error",
        title: (mutation.meta?.errorTitle as string | undefined) ?? "Action failed",
        message: (mutation.meta?.errorMessage as string | undefined) ?? extractErrorMessage(error),
      });
    },
    onSuccess: (_data, _variables, _context, mutation) => {
      const successMessage = mutation.meta?.successMessage as string | undefined;
      if (successMessage) {
        pushToast({ variant: "success", message: successMessage });
      }
    },
  }),
});
