import { create } from "zustand";
import { persist } from "zustand/middleware";

interface SettingsStore {
  autoAdvance: boolean;
  setAutoAdvance: (v: boolean) => void;
}

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set) => ({
      autoAdvance: false,
      setAutoAdvance: (v) => set({ autoAdvance: v }),
    }),
    { name: "dzerkout_settings" }
  )
);
