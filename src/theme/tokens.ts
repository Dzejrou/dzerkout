/**
 * Theme token layer.
 *
 * Architecture
 * ────────────
 * • `ThemeTokens` — the typed shape every theme must satisfy.
 * • `darkTheme` / `graphiteTheme` — concrete color objects (actual hex / rgba values).
 * • `tokens` — the object every component imports.  Each value is a CSS variable
 *   reference (`var(--name)`), so components never have to change when the theme
 *   switches; the browser resolves the variable at paint time.
 * • `applyThemeToDOM(t)` — writes a theme's concrete values onto `document.documentElement`
 *   as CSS custom properties.  Called once at module load (dark as the safe default)
 *   and again in App.tsx whenever the persisted theme setting changes.
 *
 * Adding a new token
 * ──────────────────
 * 1. Add the key + comment to `ThemeTokens`.
 * 2. Add the value to every theme object (TypeScript will flag missing entries).
 * 3. Done — the CSS variable and the `tokens` reference are generated automatically.
 *
 * Adding a new theme
 * ──────────────────
 * 1. Add a new `ThemeTokens` literal below.
 * 2. Add its key to `THEME_KEYS` and a display name to `themeNames`.
 * 3. Add it to `allThemes`.
 * 4. TypeScript will flag any missing token keys.
 */

// ── Token shape ───────────────────────────────────────────────────────────────

export interface ThemeTokens {
  // ── Backgrounds ─────────────────────────────────────────────────────────────
  bg: string;           // app-level background
  bgElevated: string;   // right-panel / elevated surface
  card: string;         // card / panel surface
  cardSubtle: string;   // icon box, very subtle surface

  // ── Borders & dividers ───────────────────────────────────────────────────────
  border: string;        // input / container border (base)
  borderSubtle: string;  // card border (very subtle)
  borderMedium: string;  // button / modal borders
  borderStrong: string;  // back button, emphasis borders
  divider: string;       // list row divider line

  // ── Interactive surfaces ─────────────────────────────────────────────────────
  surfaceSelected: string;  // selected row subtle background
  surfaceActive: string;    // interactive element enabled background
  surfaceDisabled: string;  // interactive element disabled background

  // ── Text ─────────────────────────────────────────────────────────────────────
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  textFaint: string;
  textLight: string;     // back button text, enabled interactive elements
  textDisabled: string;  // visually disabled state
  iconText: string;      // icon glyphs in menus

  // ── Overlay ──────────────────────────────────────────────────────────────────
  overlay: string;  // dark modal backdrop

  // ── Semantic action colors ────────────────────────────────────────────────────
  green: string;       // primary action / success background (buttons)
  greenText: string;   // text on green active-session badge
  greenBorder: string; // border on active green elements (e.g. toggle active ring)

  red: string;         // destructive text / error text
  redBg: string;       // destructive button background
  redBorder: string;   // destructive button border

  blue: string;        // concrete badge / info text
  amber: string;       // placeholder badge / warning text

  // ── Badge triads (text + bg + border for each semantic color) ─────────────────
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

// ── Theme definitions ─────────────────────────────────────────────────────────

/** Default dark theme — Apple-inspired warm near-blacks. */
export const darkTheme: ThemeTokens = {
  bg:         "#1c1c1e",
  bgElevated: "#242426",
  card:       "#2c2c2e",
  cardSubtle: "#3a3a3c",

  border:       "rgba(255,255,255,0.08)",
  borderSubtle: "rgba(255,255,255,0.06)",
  borderMedium: "rgba(255,255,255,0.12)",
  borderStrong: "rgba(255,255,255,0.14)",
  divider:      "rgba(255,255,255,0.07)",

  surfaceSelected:  "rgba(255,255,255,0.04)",
  surfaceActive:    "rgba(255,255,255,0.07)",
  surfaceDisabled:  "rgba(255,255,255,0.02)",

  textPrimary:   "#f2f2f7",
  textSecondary: "#8e8e93",
  textMuted:     "#6b7280",
  textFaint:     "#9ca3af",
  textLight:     "#e5e7eb",
  textDisabled:  "#4b5563",
  iconText:      "#d1d5db",

  overlay: "rgba(0,0,0,0.6)",

  green:       "#2d6a3f",
  greenText:   "#6ee7b7",
  greenBorder: "rgba(45,106,63,0.6)",

  red:       "#f87171",
  redBg:     "rgba(239,68,68,0.08)",
  redBorder: "rgba(239,68,68,0.25)",

  blue:  "#60a5fa",
  amber: "#f59e0b",

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

/**
 * Graphite — deeper, cooler near-blacks with higher contrast borders and
 * pure-white primary text.  Visibly distinct from Dark while requiring no
 * layout changes.
 */
export const graphiteTheme: ThemeTokens = {
  bg:         "#0f0f10",
  bgElevated: "#161618",
  card:       "#1e1e20",
  cardSubtle: "#28282b",

  border:       "rgba(255,255,255,0.12)",
  borderSubtle: "rgba(255,255,255,0.08)",
  borderMedium: "rgba(255,255,255,0.18)",
  borderStrong: "rgba(255,255,255,0.24)",
  divider:      "rgba(255,255,255,0.10)",

  surfaceSelected:  "rgba(255,255,255,0.06)",
  surfaceActive:    "rgba(255,255,255,0.10)",
  surfaceDisabled:  "rgba(255,255,255,0.03)",

  textPrimary:   "#ffffff",
  textSecondary: "#9a9aa8",
  textMuted:     "#6e6e80",
  textFaint:     "#9a9aa8",
  textLight:     "#eaeaf0",
  textDisabled:  "#4a4a58",
  iconText:      "#d0d0de",

  overlay: "rgba(0,0,0,0.80)",

  green:       "#276e42",
  greenText:   "#6ee7b7",
  greenBorder: "rgba(39,110,66,0.65)",

  red:       "#f87171",
  redBg:     "rgba(239,68,68,0.10)",
  redBorder: "rgba(239,68,68,0.30)",

  blue:  "#60a5fa",
  amber: "#f59e0b",

  greenBadgeText:   "#4ade80",
  greenBadgeBg:     "rgba(34,197,94,0.14)",
  greenBadgeBorder: "rgba(34,197,94,0.25)",

  amberBadgeBg:     "rgba(245,158,11,0.14)",
  amberBadgeBorder: "rgba(245,158,11,0.25)",

  redBadgeBg:     "rgba(239,68,68,0.14)",
  redBadgeBorder: "rgba(239,68,68,0.25)",

  blueBadgeBg:     "rgba(59,130,246,0.14)",
  blueBadgeBorder: "rgba(59,130,246,0.25)",

  purple:       "#a78bfa",
  purpleBg:     "rgba(139,92,246,0.14)",
  purpleBorder: "rgba(139,92,246,0.25)",
};

/**
 * Forest — dark green-tinted charcoal; natural deep-green primary accents.
 */
export const forestTheme: ThemeTokens = {
  bg:         "#141a16",
  bgElevated: "#1a2219",
  card:       "#212b23",
  cardSubtle: "#2a362e",

  border:       "rgba(120,180,130,0.10)",
  borderSubtle: "rgba(120,180,130,0.07)",
  borderMedium: "rgba(120,180,130,0.15)",
  borderStrong: "rgba(120,180,130,0.22)",
  divider:      "rgba(120,180,130,0.08)",

  surfaceSelected:  "rgba(120,180,130,0.06)",
  surfaceActive:    "rgba(120,180,130,0.10)",
  surfaceDisabled:  "rgba(255,255,255,0.02)",

  textPrimary:   "#e8f0ea",
  textSecondary: "#7a9880",
  textMuted:     "#5a7260",
  textFaint:     "#8aac90",
  textLight:     "#d4e8d8",
  textDisabled:  "#3d5040",
  iconText:      "#b8d4bc",

  overlay: "rgba(0,0,0,0.65)",

  green:       "#1e6b3a",
  greenText:   "#86efac",
  greenBorder: "rgba(30,107,58,0.65)",

  red:       "#f87171",
  redBg:     "rgba(239,68,68,0.09)",
  redBorder: "rgba(239,68,68,0.26)",

  blue:  "#60a5fa",
  amber: "#f59e0b",

  greenBadgeText:   "#4ade80",
  greenBadgeBg:     "rgba(34,197,94,0.12)",
  greenBadgeBorder: "rgba(34,197,94,0.22)",

  amberBadgeBg:     "rgba(245,158,11,0.12)",
  amberBadgeBorder: "rgba(245,158,11,0.22)",

  redBadgeBg:     "rgba(239,68,68,0.12)",
  redBadgeBorder: "rgba(239,68,68,0.22)",

  blueBadgeBg:     "rgba(59,130,246,0.12)",
  blueBadgeBorder: "rgba(59,130,246,0.22)",

  purple:       "#a78bfa",
  purpleBg:     "rgba(139,92,246,0.12)",
  purpleBorder: "rgba(139,92,246,0.22)",
};

/**
 * Ember — warm charcoal with amber/orange primary accents.
 * Destructive red is intentionally kept clearly red.
 */
export const emberTheme: ThemeTokens = {
  bg:         "#1a1614",
  bgElevated: "#221c19",
  card:       "#2c2420",
  cardSubtle: "#38302a",

  border:       "rgba(255,195,130,0.09)",
  borderSubtle: "rgba(255,195,130,0.06)",
  borderMedium: "rgba(255,195,130,0.14)",
  borderStrong: "rgba(255,195,130,0.21)",
  divider:      "rgba(255,195,130,0.07)",

  surfaceSelected:  "rgba(255,195,130,0.05)",
  surfaceActive:    "rgba(255,195,130,0.09)",
  surfaceDisabled:  "rgba(255,255,255,0.02)",

  textPrimary:   "#f5ede8",
  textSecondary: "#a08878",
  textMuted:     "#786055",
  textFaint:     "#a89080",
  textLight:     "#ecddd8",
  textDisabled:  "#58443c",
  iconText:      "#d4c0b8",

  overlay: "rgba(0,0,0,0.65)",

  // amber-brown for primary actions so the UI feels warm
  green:       "#9a5a10",
  greenText:   "#fed7aa",
  greenBorder: "rgba(154,90,16,0.65)",

  red:       "#f87171",
  redBg:     "rgba(239,68,68,0.09)",
  redBorder: "rgba(239,68,68,0.28)",

  blue:  "#93c5fd",
  amber: "#fb923c",

  greenBadgeText:   "#fdba74",
  greenBadgeBg:     "rgba(251,146,60,0.13)",
  greenBadgeBorder: "rgba(251,146,60,0.23)",

  amberBadgeBg:     "rgba(245,158,11,0.13)",
  amberBadgeBorder: "rgba(245,158,11,0.23)",

  redBadgeBg:     "rgba(239,68,68,0.12)",
  redBadgeBorder: "rgba(239,68,68,0.24)",

  blueBadgeBg:     "rgba(59,130,246,0.12)",
  blueBadgeBorder: "rgba(59,130,246,0.22)",

  purple:       "#c4b5fd",
  purpleBg:     "rgba(139,92,246,0.12)",
  purpleBorder: "rgba(139,92,246,0.22)",
};

/**
 * Slate — cool blue-gray palette; calm teal/blue primary accents.
 */
export const slateTheme: ThemeTokens = {
  bg:         "#131720",
  bgElevated: "#1a1f2a",
  card:       "#222736",
  cardSubtle: "#2c3342",

  border:       "rgba(140,180,255,0.09)",
  borderSubtle: "rgba(140,180,255,0.06)",
  borderMedium: "rgba(140,180,255,0.14)",
  borderStrong: "rgba(140,180,255,0.21)",
  divider:      "rgba(140,180,255,0.07)",

  surfaceSelected:  "rgba(140,180,255,0.05)",
  surfaceActive:    "rgba(140,180,255,0.09)",
  surfaceDisabled:  "rgba(255,255,255,0.02)",

  textPrimary:   "#e8edf8",
  textSecondary: "#7a8eac",
  textMuted:     "#5a6e8a",
  textFaint:     "#8a9eb8",
  textLight:     "#d0daf0",
  textDisabled:  "#3a4a62",
  iconText:      "#b0c4e0",

  overlay: "rgba(0,0,0,0.70)",

  // teal-blue for primary actions
  green:       "#1a5f7a",
  greenText:   "#7dd3fc",
  greenBorder: "rgba(26,95,122,0.65)",

  red:       "#f87171",
  redBg:     "rgba(239,68,68,0.09)",
  redBorder: "rgba(239,68,68,0.28)",

  blue:  "#60a5fa",
  amber: "#f59e0b",

  greenBadgeText:   "#4ade80",
  greenBadgeBg:     "rgba(34,197,94,0.12)",
  greenBadgeBorder: "rgba(34,197,94,0.22)",

  amberBadgeBg:     "rgba(245,158,11,0.12)",
  amberBadgeBorder: "rgba(245,158,11,0.22)",

  redBadgeBg:     "rgba(239,68,68,0.12)",
  redBadgeBorder: "rgba(239,68,68,0.22)",

  blueBadgeBg:     "rgba(59,130,246,0.13)",
  blueBadgeBorder: "rgba(59,130,246,0.23)",

  purple:       "#a78bfa",
  purpleBg:     "rgba(139,92,246,0.12)",
  purpleBorder: "rgba(139,92,246,0.22)",
};

// ── Theme registry ────────────────────────────────────────────────────────────

export const THEME_KEYS = ["dark", "graphite", "forest", "ember", "slate"] as const;
export type ThemeKey = (typeof THEME_KEYS)[number];

/** Display labels shown in the Settings theme selector. */
export const themeNames: Record<ThemeKey, string> = {
  dark:     "Dark",
  graphite: "Graphite",
  forest:   "Forest",
  ember:    "Ember",
  slate:    "Slate",
};

export const allThemes: Record<ThemeKey, ThemeTokens> = {
  dark:     darkTheme,
  graphite: graphiteTheme,
  forest:   forestTheme,
  ember:    emberTheme,
  slate:    slateTheme,
};

// ── CSS variable helpers ───────────────────────────────────────────────────────

/**
 * Convert a camelCase token key to its CSS custom property name.
 * Aligns with the kebab-case variable names already defined in index.html.
 *   "bg"            → "--bg"
 *   "bgElevated"    → "--bg-elevated"
 *   "textPrimary"   → "--text-primary"
 *   "greenBadgeBg"  → "--green-badge-bg"
 */
function tokenCssVar(key: string): string {
  return `--${key.replace(/([A-Z])/g, (m) => `-${m.toLowerCase()}`)}`;
}

/**
 * Write every token in `t` onto `document.documentElement` as a CSS custom
 * property.  Safe to call at any time; silently no-ops outside a browser context.
 */
export function applyThemeToDOM(t: ThemeTokens): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  (Object.entries(t) as [keyof ThemeTokens, string][]).forEach(([key, value]) => {
    root.style.setProperty(tokenCssVar(key as string), value);
  });
}

// ── The shared `tokens` object ────────────────────────────────────────────────

/**
 * Every component imports `tokens` for inline styles.  Each value is a CSS
 * variable reference (`var(--name)`) rather than a raw color literal.
 *
 * This means:
 * • Components never need to change when a new theme is applied.
 * • The browser resolves the variable at paint time, so switching themes
 *   (by calling `applyThemeToDOM` with a different theme object) instantly
 *   updates every rendered surface.
 * • TypeScript is satisfied because `ThemeTokens` requires `string` values,
 *   and `"var(--some-name)"` is a valid string.
 */
export const tokens = Object.fromEntries(
  (Object.keys(darkTheme) as (keyof ThemeTokens)[]).map((key) => [
    key,
    `var(${tokenCssVar(key as string)})`,
  ]),
) as unknown as ThemeTokens;

// Apply the dark theme immediately so CSS variables are in place before the
// first React render.  App.tsx will re-apply the user's persisted choice via
// useLayoutEffect, which runs before the browser paints.
applyThemeToDOM(darkTheme);
