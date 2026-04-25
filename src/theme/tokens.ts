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
  border: string;        // input / container border (base)
  borderSubtle: string;  // card border (very subtle)
  borderMedium: string;  // button / modal borders
  borderStrong: string;  // back button, emphasis borders
  divider: string;       // list row divider line

  // ── Interactive surfaces ───────────────────────────────────────────────────
  surfaceSelected: string;  // selected row subtle background
  surfaceActive: string;    // interactive element enabled background
  surfaceDisabled: string;  // interactive element disabled background

  // ── Text ───────────────────────────────────────────────────────────────────
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  textFaint: string;
  textLight: string;     // back button text, enabled interactive elements
  textDisabled: string;  // visually disabled state
  iconText: string;      // icon glyphs in menus

  // ── Overlay ────────────────────────────────────────────────────────────────
  overlay: string;  // dark modal backdrop

  // ── Semantic action colors ─────────────────────────────────────────────────
  green: string;       // primary action / success background (buttons)
  greenText: string;   // text on green active-session badge
  greenBorder: string; // border on active green elements (e.g. toggle active ring)

  red: string;         // destructive text / error text
  redBg: string;       // destructive button background
  redBorder: string;   // destructive button border

  blue: string;        // concrete badge / info text
  amber: string;       // placeholder badge / warning text

  // ── Badge triads (text + bg + border for each semantic color) ──────────────
  greenBadgeText: string;    // success / completed status
  greenBadgeBg: string;
  greenBadgeBorder: string;

  amberBadgeBg: string;      // warning / in-progress status (text = amber)
  amberBadgeBorder: string;

  redBadgeBg: string;        // error / abandoned status (text = red)
  redBadgeBorder: string;

  blueBadgeBg: string;       // concrete / info (text = blue)
  blueBadgeBorder: string;

  purple: string;            // placeholder tag text (secondary variant)
  purpleBg: string;
  purpleBorder: string;
}

export const darkTheme: ThemeTokens = {
  // Backgrounds
  bg:           "#1c1c1e",
  bgElevated:   "#242426",
  card:         "#2c2c2e",
  cardSubtle:   "#3a3a3c",

  // Borders
  border:        "rgba(255,255,255,0.08)",
  borderSubtle:  "rgba(255,255,255,0.06)",
  borderMedium:  "rgba(255,255,255,0.12)",
  borderStrong:  "rgba(255,255,255,0.14)",
  divider:       "rgba(255,255,255,0.07)",

  // Interactive surfaces
  surfaceSelected:  "rgba(255,255,255,0.04)",
  surfaceActive:    "rgba(255,255,255,0.07)",
  surfaceDisabled:  "rgba(255,255,255,0.02)",

  // Text
  textPrimary:   "#f2f2f7",
  textSecondary: "#8e8e93",
  textMuted:     "#6b7280",
  textFaint:     "#9ca3af",
  textLight:     "#e5e7eb",
  textDisabled:  "#4b5563",
  iconText:      "#d1d5db",

  // Overlay
  overlay: "rgba(0,0,0,0.6)",

  // Action colors
  green:       "#2d6a3f",
  greenText:   "#6ee7b7",
  greenBorder: "rgba(45,106,63,0.6)",

  red:       "#f87171",
  redBg:     "rgba(239,68,68,0.08)",
  redBorder: "rgba(239,68,68,0.25)",

  blue:  "#60a5fa",
  amber: "#f59e0b",

  // Badge triads
  greenBadgeText:   "#4ade80",
  greenBadgeBg:     "rgba(34,197,94,0.12)",
  greenBadgeBorder: "rgba(34,197,94,0.2)",

  amberBadgeBg:     "rgba(245,158,11,0.12)",
  amberBadgeBorder: "rgba(245,158,11,0.2)",

  redBadgeBg:     "rgba(239,68,68,0.12)",
  redBadgeBorder: "rgba(239,68,68,0.2)",

  blueBadgeBg:     "rgba(59,130,246,0.12)",
  blueBadgeBorder: "rgba(59,130,246,0.2)",

  purple:       "#a78bfa",
  purpleBg:     "rgba(139,92,246,0.12)",
  purpleBorder: "rgba(139,92,246,0.2)",
};

/** Active theme — swap this export when theme switching is implemented. */
export const tokens = darkTheme;
