import { useNavigate } from "react-router-dom";
import { tokens } from "../../theme/tokens";
import { useSettingsStore } from "../../store/settingsStore";
import { fontPresets, FONT_PRESET_KEYS, type FontPresetKey } from "../../theme/fontPresets";
import { playPreviewCue } from "../../audio/cues";

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

// ── Page ──────────────────────────────────────────────────────────────────────

export default function Settings() {
  const navigate = useNavigate();
  const autoAdvance = useSettingsStore((s) => s.autoAdvance);
  const setAutoAdvance = useSettingsStore((s) => s.setAutoAdvance);
  const soundCues = useSettingsStore((s) => s.soundCues);
  const setSoundCues = useSettingsStore((s) => s.setSoundCues);

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
            control={<div style={themeChipStyle}>Dark</div>}
          />
          <div style={rowDividerStyle} />
          <SettingRow
            label="Font"
            description="UI typeface applied across the entire app."
            control={<FontSelector />}
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
            label="Rest timer"
            description="Show a countdown between exercises."
            control={<ComingSoonBadge />}
            disabled
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

const themeChipStyle: React.CSSProperties = {
  padding: "4px 12px",
  borderRadius: 6,
  background: tokens.cardSubtle,
  border: `1px solid ${tokens.border}`,
  color: tokens.textPrimary,
  fontSize: 13,
  fontWeight: 500,
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
