import { useNavigate } from "react-router-dom";
import { tokens } from "../../theme/tokens";

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

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={sectionStyle}>
      <h2 style={sectionTitleStyle}>{title}</h2>
      <div style={sectionCardStyle}>{children}</div>
    </div>
  );
}

function ComingSoonBadge() {
  return (
    <span style={comingSoonStyle}>Coming soon</span>
  );
}

export default function Settings() {
  const navigate = useNavigate();

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
            control={
              <div style={themeChipStyle}>Dark</div>
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
            description="Automatically move to the next exercise when duration elapses."
            control={<ComingSoonBadge />}
            disabled
          />
          <div style={rowDividerStyle} />
          <SettingRow
            label="Enforce duration hints"
            description="Prevent advancing before a duration hint has elapsed."
            control={<ComingSoonBadge />}
            disabled
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
            label="Enable sounds"
            description="Play audio cues during workouts."
            control={<ComingSoonBadge />}
            disabled
          />
          <div style={rowDividerStyle} />
          <SettingRow
            label="Sound pack"
            description="Choose which sounds to play."
            control={<ComingSoonBadge />}
            disabled
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
  background: "rgba(255,255,255,0.09)",
  border: "1px solid rgba(255,255,255,0.14)",
  borderRadius: 8,
  color: "#e5e7eb",
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

const footerStyle: React.CSSProperties = {
  textAlign: "center",
  fontSize: 12,
  color: tokens.textMuted,
  marginTop: 8,
};
