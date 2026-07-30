import { useEffect, useState } from "react";
import { useTheme } from "./ThemeContext";
import { useUserPreference } from "../hooks/useUserPreference";

// ThemeProvider sits above AuthProvider (the login page needs a theme before anyone's signed
// in), so it can't reach the logged-in user itself. This renders only inside the authenticated
// shell and syncs the theme choice to the account — same day/night mode on every device, not
// just whichever browser last set it in localStorage.
export function ThemeSync() {
  const { theme, setTheme } = useTheme();
  const { value: savedTheme, setValue: saveTheme, isLoading } = useUserPreference<"light" | "dark" | null>("theme", null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (isLoading || hydrated) return;
    if (savedTheme === "light" || savedTheme === "dark") setTheme(savedTheme);
    setHydrated(true);
  }, [isLoading, hydrated, savedTheme, setTheme]);

  useEffect(() => {
    if (!hydrated) return;
    saveTheme(theme);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme, hydrated]);

  return null;
}
