import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { tokens, THEME_KEYS, themeNames, type ThemeKey } from "../../theme/tokens";
import { useSettingsStore } from "../../store/settingsStore";
import { fontPresets, FONT_PRESET_KEYS, type FontPresetKey } from "../../theme/fontPresets";
import { playPreviewCue } from "../../audio/cues";
import { libraryApi, type ExportScope } from "../../api/library";
import type { ImportResult } from "../../types/library";

// ── Toggle ────────────────────────────────────────────────────────────────────

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      role="switch"
      aria-checked={value}
      onClick={() => onChange(!value)}
      style={{
        position: "relative",
        width: 44,
        height: 26,
        borderRadius: 13,
        background: value ? tokens.green : tokens.cardSubtle,
        border: `1px solid ${value ? tokens.greenBorder : tokens.border}`,
        cursor: "pointer",
        padding: 0,
        flexShrink: 0,
        transition: "background 0.18s, border-color 0.18s",
      }}
    >
      <span
        style={{
          position: "absolute",
          top: 3,
          left: value ? 21 : 3,
          width: 18,
          height: 18,
          borderRadius: "50%",
          background: "#fff",
          transition: "left 0.18s",
          display: "block",
        }}
      />
    </button>
  );
}

// ── Setting row ───────────────────────────────────────────────────────────────

interface SettingRowProps {
  label: string;
  description?: string;
  control: React.ReactNode;
  disabled?: boolean;
}

function SettingRow({ label, description, control, disabled }: SettingRowProps) {
  return (
    <div style={{ ...rowStyle, opacity: disabled ? 0.45 : 1 }}>
      <div style={rowBodyStyle}>
        <span style={rowLabelStyle}>{label}</span>
        {description && <span style={rowDescStyle}>{description}</span>}
      </div>
      <div style={rowControlStyle}>{control}</div>
    </div>
  );
}

// ── Section card ──────────────────────────────────────────────────────────────

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={sectionStyle}>
      <h2 style={sectionTitleStyle}>{title}</h2>
      <div style={sectionCardStyle}>{children}</div>
    </div>
  );
}

function ComingSoonBadge() {
  return <span style={comingSoonStyle}>Coming soon</span>;
}

// ── Slider control ────────────────────────────────────────────────────────────

interface SliderControlProps {
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step: number;
  /** Format the current value for display, e.g. (v) => `${Math.round(v * 100)}%` */
  format: (v: number) => string;
}

function SliderControl({ value, onChange, min, max, step, format }: SliderControlProps) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <span style={sliderValueStyle}>{format(value)}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        style={{ width: 120, accentColor: tokens.green, cursor: "pointer" }}
      />
    </div>
  );
}

// ── Font selector ─────────────────────────────────────────────────────────────

function FontSelector() {
  const fontPreset = useSettingsStore((s) => s.fontPreset);
  const setFontPreset = useSettingsStore((s) => s.setFontPreset);

  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
      {FONT_PRESET_KEYS.map((key: FontPresetKey) => {
        const active = fontPreset === key;
        return (
          <button
            key={key}
            onClick={() => setFontPreset(key)}
            style={{
              padding: "5px 13px",
              borderRadius: 7,
              border: `1px solid ${active ? tokens.green : tokens.border}`,
              background: active ? tokens.green : tokens.cardSubtle,
              color: active ? tokens.greenText : tokens.textPrimary,
              cursor: "pointer",
              fontSize: 13,
              fontWeight: active ? 600 : 400,
              /* Each chip previews its own font so the user can see the difference */
              fontFamily: fontPresets[key].stack,
              transition: "background 0.12s, border-color 0.12s, color 0.12s",
            }}
          >
            {fontPresets[key].label}
          </button>
        );
      })}
    </div>
  );
}

// ── Theme selector ────────────────────────────────────────────────────────────

function ThemeSelector() {
  const theme = useSettingsStore((s) => s.theme);
  const setTheme = useSettingsStore((s) => s.setTheme);

  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
      {THEME_KEYS.map((key: ThemeKey) => {
        const active = theme === key;
        return (
          <button
            key={key}
            onClick={() => setTheme(key)}
            style={{
              padding: "5px 13px",
              borderRadius: 7,
              border: `1px solid ${active ? tokens.green : tokens.border}`,
              background: active ? tokens.green : tokens.cardSubtle,
              color: active ? tokens.greenText : tokens.textPrimary,
              cursor: "pointer",
              fontSize: 13,
              fontWeight: active ? 600 : 400,
              transition: "background 0.12s, border-color 0.12s, color 0.12s",
            }}
          >
            {themeNames[key]}
          </button>
        );
      })}
    </div>
  );
}

// ── Library section ───────────────────────────────────────────────────────────

const SCOPE_OPTIONS: { value: ExportScope; label: string }[] = [
  { value: "full",      label: "Full" },
  { value: "exercises", label: "Exercises" },
  { value: "sets",      label: "Sets" },
  { value: "workouts",  label: "Workouts" },
];

const SCOPE_DESC: Record<ExportScope, string> = {
  full:      "All exercises, set templates, and workout templates.",
  exercises: "All exercises and their tags only.",
  sets:      "Global (reusable) sets and the exercises they reference.",
  workouts:  "All workouts plus their sets (including workout-local), assignments, and referenced exercises.",
};

function LibrarySection() {
  const [exportScope, setExportScope] = useState<ExportScope>("full");
  const [exportStatus, setExportStatus] = useState<"idle" | "loading" | "copied" | "error">("idle");
  const [importText, setImportText] = useState("");
  const [importStatus, setImportStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  async function handleExport() {
    setExportStatus("loading");
    try {
      const json = await libraryApi.exportJson(exportScope);
      await navigator.clipboard.writeText(json);
      setExportStatus("copied");
      setTimeout(() => setExportStatus("idle"), 2500);
    } catch {
      setExportStatus("error");
      setTimeout(() => setExportStatus("idle"), 3000);
    }
  }

  async function handleImport() {
    if (!importText.trim()) return;
    setImportStatus("loading");
    setImportResult(null);
    setImportError(null);
    try {
      const result = await libraryApi.importJson(importText.trim());
      setImportResult(result);
      setImportStatus("success");
      setImportText("");
    } catch (err) {
      setImportError(err instanceof Error ? err.message : String(err));
      setImportStatus("error");
    }
  }

  const exportLabel =
    exportStatus === "loading" ? "Exporting…"
    : exportStatus === "copied" ? "Copied!"
    : exportStatus === "error" ? "Export failed"
    : "Export to clipboard";

  return (
    <div style={sectionStyle}>
      <h2 style={sectionTitleStyle}>Library</h2>
      <div style={sectionCardStyle}>
        {/* Export row */}
        <div style={{ padding: "14px 18px", display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={rowBodyStyle}>
            <span style={rowLabelStyle}>Export library</span>
            <span style={rowDescStyle}>{SCOPE_DESC[exportScope]}</span>
          </div>
          {/* Scope selector */}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {SCOPE_OPTIONS.map(({ value, label }) => {
              const active = exportScope === value;
              return (
                <button
                  key={value}
                  onClick={() => { setExportScope(value); setExportStatus("idle"); }}
                  style={{
                    padding: "5px 13px",
                    borderRadius: 7,
                    border: `1px solid ${active ? tokens.green : tokens.border}`,
                    background: active ? tokens.green : tokens.cardSubtle,
                    color: active ? tokens.greenText : tokens.textPrimary,
                    cursor: "pointer",
                    fontSize: 13,
                    fontWeight: active ? 600 : 400,
                    transition: "background 0.12s, border-color 0.12s, color 0.12s",
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>
          <button
            onClick={handleExport}
            disabled={exportStatus === "loading"}
            style={{
              ...libBtnStyle,
              alignSelf: "flex-start",
              background: exportStatus === "copied" ? tokens.green : tokens.surfaceActive,
              color: exportStatus === "copied" ? tokens.greenText : tokens.textLight,
              border: `1px solid ${exportStatus === "copied" ? tokens.greenBorder : tokens.borderMedium}`,
            }}
          >
            {exportLabel}
          </button>
        </div>
        <div style={rowDividerStyle} />
        {/* Import row */}
        <div style={{ padding: "14px 18px", display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={rowBodyStyle}>
            <span style={rowLabelStyle}>Import library JSON</span>
            <span style={rowDescStyle}>
              Paste a previously exported JSON below. Existing items will be updated; new items will be added.
              The import runs in a single transaction — any validation error rolls everything back.
            </span>
          </div>
          <textarea
            value={importText}
            onChange={(e) => {
              setImportText(e.target.value);
              if (importStatus !== "idle") { setImportStatus("idle"); setImportError(null); setImportResult(null); }
            }}
            placeholder='Paste exported JSON here…'
            rows={6}
            style={importTextareaStyle}
          />
          {importStatus === "success" && importResult && (
            <div style={importSuccessStyle}>
              Imported —{" "}
              exercises: +{importResult.exercises_created} / ↻{importResult.exercises_updated},{" "}
              sets: +{importResult.sets_created} / ↻{importResult.sets_updated},{" "}
              workouts: +{importResult.workouts_created} / ↻{importResult.workouts_updated}
            </div>
          )}
          {importStatus === "error" && importError && (
            <div style={importErrorStyle}>{importError}</div>
          )}
          <button
            onClick={handleImport}
            disabled={importStatus === "loading" || !importText.trim()}
            style={{
              ...libBtnStyle,
              alignSelf: "flex-start",
              opacity: importStatus === "loading" || !importText.trim() ? 0.5 : 1,
            }}
          >
            {importStatus === "loading" ? "Importing…" : "Import"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function Settings() {
  const navigate = useNavigate();
  const autoAdvance = useSettingsStore((s) => s.autoAdvance);
  const setAutoAdvance = useSettingsStore((s) => s.setAutoAdvance);
  const soundCues = useSettingsStore((s) => s.soundCues);
  const setSoundCues = useSettingsStore((s) => s.setSoundCues);
  const runnerCardSize = useSettingsStore((s) => s.runnerCardSize);
  const setRunnerCardSize = useSettingsStore((s) => s.setRunnerCardSize);
  const autoStartNextSet = useSettingsStore((s) => s.autoStartNextSet);
  const setAutoStartNextSet = useSettingsStore((s) => s.setAutoStartNextSet);

  return (
    <div style={rootStyle}>
      <div style={contentStyle}>
        <button onClick={() => navigate("/")} style={backBtnStyle}>← Back</button>
        <h1 style={pageTitleStyle}>Settings</h1>

        {/* ── Appearance ─────────────────────────────────────────────────── */}
        <SectionCard title="Appearance">
          <SettingRow
            label="Theme"
            description="Color scheme used throughout the app."
            control={<ThemeSelector />}
          />
          <div style={rowDividerStyle} />
          <SettingRow
            label="Font"
            description="UI typeface applied across the entire app."
            control={<FontSelector />}
          />
          <div style={rowDividerStyle} />
          <SettingRow
            label="Runner card size"
            description="Height of exercise queue cards in the workout runner."
            control={
              <SliderControl
                value={runnerCardSize}
                onChange={setRunnerCardSize}
                min={0.5}
                max={2.0}
                step={0.1}
                format={(v) => `${Math.round(v * 100)}%`}
              />
            }
          />
          <div style={rowDividerStyle} />
          <SettingRow
            label="Additional themes"
            description="Light mode and custom palettes."
            control={<ComingSoonBadge />}
            disabled
          />
        </SectionCard>

        {/* ── Workout behavior ───────────────────────────────────────────── */}
        <SectionCard title="Workout Behavior">
          <SettingRow
            label="Auto-advance exercises"
            description="When an exercise has a duration target, automatically move to the next exercise when time is up."
            control={
              <Toggle value={autoAdvance} onChange={setAutoAdvance} />
            }
          />
          <div style={rowDividerStyle} />
          <SettingRow
            label="Auto-start next set"
            description="Automatically start the next set when between-set rest reaches zero."
            control={
              <Toggle value={autoStartNextSet} onChange={setAutoStartNextSet} />
            }
          />
        </SectionCard>

        {/* ── Sound cues ─────────────────────────────────────────────────── */}
        <SectionCard title="Sound Cues">
          <SettingRow
            label="Sound cues"
            description="Play countdown beeps near the end of timed exercises and between-set rest."
            control={<Toggle value={soundCues} onChange={setSoundCues} />}
          />
          <div style={rowDividerStyle} />
          <SettingRow
            label="Preview cue"
            description="Play the full countdown sequence right now so you know what to expect."
            control={
              <button onClick={playPreviewCue} style={previewBtnStyle}>
                ▶ Preview
              </button>
            }
          />
        </SectionCard>

        {/* ── Library ────────────────────────────────────────────────────── */}
        <LibrarySection />

        <p style={footerStyle}>More options will appear here as features ship.</p>
      </div>
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const rootStyle: React.CSSProperties = {
  minHeight: "100%",
  background: tokens.bg,
  color: tokens.textPrimary,
};

const contentStyle: React.CSSProperties = {
  maxWidth: 640,
  margin: "0 auto",
  padding: "16px 20px 48px",
};

const backBtnStyle: React.CSSProperties = {
  background: tokens.surfaceActive,
  border: `1px solid ${tokens.borderStrong}`,
  borderRadius: 8,
  color: tokens.textLight,
  cursor: "pointer",
  fontSize: 13,
  fontWeight: 500,
  padding: "6px 14px",
  display: "block",
  marginBottom: 14,
};

const pageTitleStyle: React.CSSProperties = {
  fontSize: 34,
  fontWeight: 800,
  margin: "0 0 28px",
  letterSpacing: "-0.02em",
  color: tokens.textPrimary,
};

const sectionStyle: React.CSSProperties = {
  marginBottom: 28,
};

const sectionTitleStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  color: tokens.textSecondary,
  margin: "0 0 8px 4px",
};

const sectionCardStyle: React.CSSProperties = {
  background: tokens.card,
  border: `1px solid ${tokens.borderSubtle}`,
  borderRadius: 14,
  overflow: "hidden",
};

const rowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 16,
  padding: "14px 18px",
};

const rowBodyStyle: React.CSSProperties = {
  flex: 1,
  display: "flex",
  flexDirection: "column",
  gap: 3,
  minWidth: 0,
};

const rowLabelStyle: React.CSSProperties = {
  fontSize: 15,
  fontWeight: 500,
  color: tokens.textPrimary,
};

const rowDescStyle: React.CSSProperties = {
  fontSize: 12,
  color: tokens.textSecondary,
  lineHeight: 1.4,
};

const rowControlStyle: React.CSSProperties = {
  flexShrink: 0,
};

const rowDividerStyle: React.CSSProperties = {
  height: 1,
  background: tokens.divider,
  margin: "0 18px",
};


const comingSoonStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: "0.04em",
  textTransform: "uppercase",
  color: tokens.textMuted,
  background: tokens.cardSubtle,
  border: `1px solid ${tokens.border}`,
  borderRadius: 5,
  padding: "3px 8px",
};

const sliderValueStyle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  fontVariantNumeric: "tabular-nums",
  color: tokens.textSecondary,
  minWidth: 38,
  textAlign: "right",
};

const previewBtnStyle: React.CSSProperties = {
  padding: "5px 14px",
  borderRadius: 7,
  border: `1px solid ${tokens.borderMedium}`,
  background: tokens.surfaceActive,
  color: tokens.textLight,
  cursor: "pointer",
  fontSize: 13,
  fontWeight: 600,
};

const footerStyle: React.CSSProperties = {
  textAlign: "center",
  fontSize: 12,
  color: tokens.textMuted,
  marginTop: 8,
};

const libBtnStyle: React.CSSProperties = {
  padding: "6px 14px",
  borderRadius: 7,
  border: `1px solid ${tokens.borderMedium}`,
  background: tokens.surfaceActive,
  color: tokens.textLight,
  cursor: "pointer",
  fontSize: 13,
  fontWeight: 600,
  transition: "background 0.12s, color 0.12s, border-color 0.12s",
};

const importTextareaStyle: React.CSSProperties = {
  background: tokens.cardSubtle,
  border: `1px solid ${tokens.border}`,
  borderRadius: 8,
  color: tokens.textPrimary,
  fontSize: 12,
  fontFamily: "monospace",
  padding: "10px 12px",
  resize: "vertical",
  outline: "none",
};

const importSuccessStyle: React.CSSProperties = {
  fontSize: 12,
  color: tokens.greenBadgeText,
  background: tokens.green,
  border: `1px solid ${tokens.greenBorder}`,
  borderRadius: 7,
  padding: "7px 12px",
};

const importErrorStyle: React.CSSProperties = {
  fontSize: 12,
  color: tokens.textPrimary,
  background: tokens.cardSubtle,
  border: `1px solid ${tokens.borderStrong}`,
  borderRadius: 7,
  padding: "7px 12px",
  wordBreak: "break-word",
};
