/**
 * Font presets for the typography token layer.
 *
 * Each preset is a named family stack using only system-safe fonts — no
 * network downloads required. The active preset is persisted in settingsStore
 * and applied globally by writing `--font-family` onto `document.documentElement`.
 *
 * To add a preset: extend `FontPresetKey`, add an entry to `fontPresets`,
 * and update the `:root` fallback in index.html if the default changes.
 */

export type FontPresetKey = "system" | "apple" | "android" | "serif";

export interface FontPreset {
  label: string;
  /** CSS font-family stack — system-safe only. */
  stack: string;
}

export const fontPresets: Record<FontPresetKey, FontPreset> = {
  system: {
    label: "System",
    stack: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  },
  apple: {
    label: "Apple",
    stack: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", sans-serif',
  },
  android: {
    label: "Android",
    stack: '"Roboto", "Noto Sans", "Segoe UI", sans-serif',
  },
  serif: {
    label: "Serif",
    stack: 'Georgia, "Times New Roman", serif',
  },
};

export const FONT_PRESET_KEYS = Object.keys(fontPresets) as FontPresetKey[];

export const defaultFontPreset: FontPresetKey = "system";
