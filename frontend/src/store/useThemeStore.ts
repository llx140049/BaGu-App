import { create } from "zustand";
import { getDb } from "../data/db";

type Theme = "light" | "dark";

interface ThemeStore {
  theme: Theme;
  hydrated: boolean;
  toggleTheme: () => void;
  setTheme: (t: Theme) => void;
  hydrateTheme: () => Promise<void>;
}

export const useThemeStore = create<ThemeStore>((set) => ({
  theme: "light",
  hydrated: false,
  toggleTheme: () => set((state) => {
    const theme = state.theme === "light" ? "dark" : "light";
    getDb().then((db) => db.runAsync(
      "INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      ["theme", theme],
    )).catch(() => undefined);
    return { theme };
  }),
  setTheme: (theme) => set({ theme }),
  hydrateTheme: async () => {
    try {
      const db = await getDb();
      const row = await db.getFirstAsync("SELECT value FROM app_settings WHERE key = ?", ["theme"]);
      set({ theme: row?.value === "dark" ? "dark" : "light", hydrated: true });
    } catch {
      set({ hydrated: true });
    }
  },
}));
