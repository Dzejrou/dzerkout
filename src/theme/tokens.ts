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

// ── Theme registry ────────────────────────────────────────────────────────────

export const THEME_KEYS = ["dark", "graphite"] as const;
export type ThemeKey = (typeof THEME_KEYS)[number];

/** Display labels shown in the Settings theme selector. */
export const themeNames: Record<ThemeKey, string> = {
  dark:      "Dark",
  graphite:  "Graphite",
};

export const allThemes: Record<ThemeKey, ThemeTokens> = {
  dark:      darkTheme,
  graphite:  graphiteTheme,
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
