import { useNavigate } from "react-router-dom";
import { useSessionStore } from "../../store/sessionStore";
import { tokens } from "../../theme/tokens";

interface MenuItem {
  to: string;
  label: string;
  desc: string;
  icon: string;
}

const MENU_ITEMS: MenuItem[] = [
  { to: "/exercises", label: "Exercises", desc: "Manage your exercise library.", icon: "⊞" },
  { to: "/sets",      label: "Sets",      desc: "Create and organize your sets.", icon: "≡" },
  { to: "/workouts",  label: "Workouts",  desc: "Build and edit your workout templates.", icon: "⊟" },
  { to: "/runner",    label: "Runner",    desc: "Start and run your workouts.", icon: "▶" },
  { to: "/history",   label: "History",   desc: "View your past workout sessions.", icon: "↺" },
  { to: "/stats",     label: "Stats",     desc: "See aggregates across completed workouts.", icon: "◎" },
];

export default function MainMenu() {
  const navigate = useNavigate();
  const sessionId = useSessionStore((s) => s.sessionId);

  return (
    <div style={rootStyle}>
      {/* Options button */}
      <div style={topBarStyle}>
        <div style={{ flex: 1 }} />
        <button style={optionsBtnStyle} onClick={() => navigate("/settings")}>
          ⚙ Options
        </button>
      </div>

      {/* Logo */}
      <div style={logoAreaStyle}>
        <h1 style={logoStyle}>dzerkout</h1>
        <p style={taglineStyle}>Build. Plan. Perform.</p>
      </div>

      {/* Menu items */}
      <div style={listStyle}>
        {MENU_ITEMS.map(({ to, label, desc, icon }) => {
          const isRunner = label === "Runner";
          const hasSession = !!sessionId;
          const showBadge = isRunner && hasSession;

          return (
            <button
              key={to}
              onClick={() => navigate(to)}
              style={itemStyle}
            >
              <div style={iconBoxStyle}>
                <span style={iconTextStyle}>{icon}</span>
              </div>
              <div style={itemBodyStyle}>
                <span style={itemLabelStyle}>{label}</span>
                {showBadge && <span style={activeBadgeStyle}>Active</span>}
                <span style={itemDescStyle}>{desc}</span>
              </div>
              <span style={chevronStyle}>›</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const rootStyle: React.CSSProperties = {
  minHeight: "100%",
  background: tokens.bg,
  color: tokens.textPrimary,
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
};

const topBarStyle: React.CSSProperties = {
  width: "100%",
  maxWidth: 700,
  display: "flex",
  alignItems: "center",
  padding: "14px 20px 0",
  boxSizing: "border-box",
};

const optionsBtnStyle: React.CSSProperties = {
  background: tokens.card,
  border: `1px solid ${tokens.divider}`,
  borderRadius: 8,
  color: tokens.textFaint,
  cursor: "pointer",
  fontSize: 13,
  fontWeight: 500,
  padding: "6px 14px",
};

const logoAreaStyle: React.CSSProperties = {
  textAlign: "center",
  padding: "var(--menu-logo-pad-t) 20px var(--menu-logo-pad-b)",
};

const logoStyle: React.CSSProperties = {
  fontSize: 48,
  fontWeight: 800,
  margin: 0,
  color: tokens.textPrimary,
  letterSpacing: "-0.02em",
};

const taglineStyle: React.CSSProperties = {
  fontSize: 15,
  color: tokens.textSecondary,
  margin: "8px 0 0",
};

const listStyle: React.CSSProperties = {
  width: "100%",
  maxWidth: 700,
  padding: "0 20px 32px",
  boxSizing: "border-box",
  display: "flex",
  flexDirection: "column",
  gap: 10,
};

const itemStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 16,
  padding: "14px 16px",
  background: tokens.card,
  border: `1px solid ${tokens.divider}`,
  borderRadius: 14,
  cursor: "pointer",
  textAlign: "left",
  width: "100%",
  color: "inherit",
};

const iconBoxStyle: React.CSSProperties = {
  width: 46,
  height: 46,
  borderRadius: 10,
  background: tokens.cardSubtle,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
};

const iconTextStyle: React.CSSProperties = {
  fontSize: 20,
  color: tokens.iconText,
  lineHeight: 1,
};

const itemBodyStyle: React.CSSProperties = {
  flex: 1,
  display: "flex",
  flexDirection: "column",
  gap: 3,
  minWidth: 0,
};

const itemLabelStyle: React.CSSProperties = {
  fontSize: 18,
  fontWeight: 600,
  color: tokens.textPrimary,
};

const itemDescStyle: React.CSSProperties = {
  fontSize: 13,
  color: tokens.textSecondary,
};

const activeBadgeStyle: React.CSSProperties = {
  alignSelf: "flex-start",
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  background: tokens.green,
  color: tokens.greenText,
  padding: "2px 7px",
  borderRadius: 4,
};

const chevronStyle: React.CSSProperties = {
  fontSize: 22,
  color: tokens.textMuted,
  flexShrink: 0,
};
