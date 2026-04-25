/**
 * Design token layer for the current dark palette.
 * All values here are the single source of truth — import from here,
 * do not duplicate color literals across page files.
 *
 * Future: swap `darkTheme` for another theme object and re-export
 * the active set based on a user preference, without touching any page.
 */

export interface ThemeTokens {
  // ── Backgrounds ────────────────────────────────────────────────────────────
  bg: string;           // app-level background
  bgElevated: string;   // right-panel / elevated surface (slightly lighter than bg)
  card: string;         // card / panel surface
  cardSubtle: string;   // icon box, very subtle surface

  // ── Borders & dividers ─────────────────────────────────────────────────────
  border: string;       // input / container border (most visible)
  borderSubtle: string; // card border (very subtle)
  divider: string;      // list row divider line

  // ── Text ───────────────────────────────────────────────────────────────────
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  textFaint: string;

  // ── Semantic ───────────────────────────────────────────────────────────────
  green: string;        // primary action / success background
  greenText: string;    // text on green background

  red: string;          // destructive / error
  blue: string;         // concrete badge / info
  amber: string;        // placeholder badge / warning
}

export const darkTheme: ThemeTokens = {
  bg:           "#1c1c1e",
  bgElevated:   "#242426",
  card:         "#2c2c2e",
  cardSubtle:   "#3a3a3c",

  border:        "rgba(255,255,255,0.08)",
  borderSubtle:  "rgba(255,255,255,0.06)",
  divider:       "rgba(255,255,255,0.07)",

  textPrimary:   "#f2f2f7",
  textSecondary: "#8e8e93",
  textMuted:     "#6b7280",
  textFaint:     "#9ca3af",

  green:         "#2d6a3f",
  greenText:     "#6ee7b7",

  red:           "#f87171",
  blue:          "#60a5fa",
  amber:         "#f59e0b",
};

/** Active theme — swap this export when theme switching is implemented. */
export const tokens = darkTheme;
