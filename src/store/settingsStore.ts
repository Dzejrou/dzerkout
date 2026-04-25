import { create } from "zustand";
import { persist } from "zustand/middleware";
import { type FontPresetKey, defaultFontPreset } from "../theme/fontPresets";

interface SettingsStore {
  autoAdvance: boolean;
  setAutoAdvance: (v: boolean) => void;

  fontPreset: FontPresetKey;
  setFontPreset: (v: FontPresetKey) => void;
}

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set) => ({
      autoAdvance: false,
      setAutoAdvance: (v) => set({ autoAdvance: v }),

      fontPreset: defaultFontPreset,
      setFontPreset: (v) => set({ fontPreset: v }),
    }),
    { name: "dzerkout_settings" }
  )
);
