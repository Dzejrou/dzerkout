import { create } from "zustand";
import { persist } from "zustand/middleware";
import { type FontPresetKey, defaultFontPreset } from "../theme/fontPresets";
import { type ThemeKey } from "../theme/tokens";

interface SettingsStore {
  theme: ThemeKey;
  setTheme: (v: ThemeKey) => void;

  autoAdvance: boolean;
  setAutoAdvance: (v: boolean) => void;

  fontPreset: FontPresetKey;
  setFontPreset: (v: FontPresetKey) => void;

  /** Play Web Audio countdown beeps during timed exercise and rest phases. Default: off. */
  soundCues: boolean;
  setSoundCues: (v: boolean) => void;

  /**
   * Scale multiplier for exercise queue cards in the runner.
   * 1.0 = default appearance. Range: 0.5–2.0.
   */
  runnerCardSize: number;
  setRunnerCardSize: (v: number) => void;

  /** Automatically start the next set when between-set rest reaches zero. Default: off. */
  autoStartNextSet: boolean;
  setAutoStartNextSet: (v: boolean) => void;
}

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set) => ({
      theme: "dark" as ThemeKey,
      setTheme: (v) => set({ theme: v }),

      autoAdvance: false,
      setAutoAdvance: (v) => set({ autoAdvance: v }),

      fontPreset: defaultFontPreset,
      setFontPreset: (v) => set({ fontPreset: v }),

      soundCues: false,
      setSoundCues: (v) => set({ soundCues: v }),

      runnerCardSize: 1.0,
      setRunnerCardSize: (v) => set({ runnerCardSize: v }),

      autoStartNextSet: false,
      setAutoStartNextSet: (v) => set({ autoStartNextSet: v }),
    }),
    { name: "dzerkout_settings" }
  )
);
