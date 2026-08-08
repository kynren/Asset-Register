// Cross-screen "which dashboard is currently showing" signal for the home module. Kept as a plain
// React Query cache entry (set via queryClient.setQueryData, read via useQuery) rather than
// AsyncStorage-backed global state — this is a "last selected this session" convenience, not
// something that needs to survive an app restart, so the extra hydration wiring isn't worth it.
export const ACTIVE_DASHBOARD_QUERY_KEY = ["mobile-active-dashboard-home"];
