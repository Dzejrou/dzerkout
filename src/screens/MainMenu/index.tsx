import { useNavigate } from "react-router-dom";
import { useSessionStore } from "../../store/sessionStore";

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
];

export default function MainMenu() {
  const navigate = useNavigate();
  const sessionId = useSessionStore((s) => s.sessionId);

  return (
    <div style={rootStyle}>
      {/* Options button */}
      <div style={topBarStyle}>
        <div style={{ flex: 1 }} />
        <button style={optionsBtnStyle} disabled title="Settings (coming soon)">
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
  background: "#1c1c1e",
  color: "#f2f2f7",
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
  background: "#2c2c2e",
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: 8,
  color: "#9ca3af",
  cursor: "not-allowed",
  fontSize: 13,
  fontWeight: 500,
  padding: "6px 14px",
};

const logoAreaStyle: React.CSSProperties = {
  textAlign: "center",
  padding: "40px 20px 36px",
};

const logoStyle: React.CSSProperties = {
  fontSize: 48,
  fontWeight: 800,
  margin: 0,
  color: "#f2f2f7",
  letterSpacing: "-0.02em",
};

const taglineStyle: React.CSSProperties = {
  fontSize: 15,
  color: "#8e8e93",
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
  background: "#2c2c2e",
  border: "1px solid rgba(255,255,255,0.07)",
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
  background: "#3a3a3c",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
};

const iconTextStyle: React.CSSProperties = {
  fontSize: 20,
  color: "#d1d5db",
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
  color: "#f2f2f7",
};

const itemDescStyle: React.CSSProperties = {
  fontSize: 13,
  color: "#8e8e93",
};

const activeBadgeStyle: React.CSSProperties = {
  alignSelf: "flex-start",
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  background: "#2d6a3f",
  color: "#6ee7b7",
  padding: "2px 7px",
  borderRadius: 4,
};

const chevronStyle: React.CSSProperties = {
  fontSize: 22,
  color: "#6b7280",
  flexShrink: 0,
};
