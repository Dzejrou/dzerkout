import "./MainMenu.css";
import { useNavigate } from "react-router-dom";
import { useSessionStore } from "../../store/sessionStore";

const LEFT_NAV = [
  { to: "/exercises", label: "Exercises", icon: "⊞" },
  { to: "/sets",      label: "Sets",      icon: "≡" },
  { to: "/workouts",  label: "Workouts",  icon: "⊟" },
];

const RIGHT_NAV = [
  { to: "/runner",  label: "Runner",  icon: "▶" },
  { to: "/history", label: "History", icon: "↺" },
  { to: "/stats",   label: "Stats",   icon: "◎" },
];

interface NavBtnProps {
  to: string;
  label: string;
  icon: string;
  navigate: (to: string) => void;
  activeBadge?: boolean;
}

function NavBtn({ to, label, icon, navigate, activeBadge }: NavBtnProps) {
  return (
    <button className="mm-nav-btn" onClick={() => navigate(to)}>
      <span className="mm-icon-box">{icon}</span>
      <span className="mm-btn-label">{label}</span>
      {activeBadge && <span className="mm-active-badge">Active</span>}
    </button>
  );
}

export default function MainMenu() {
  const navigate = useNavigate();
  const sessionId = useSessionStore((s) => s.sessionId);
  const hasSession = !!sessionId;

  return (
    <div className="mm-root">
      {/* Header: breathing space + title. Options button is absolute top-right. */}
      <div className="mm-header">
        <button className="mm-options-btn" onClick={() => navigate("/settings")}>
          ⚙ Options
        </button>
        <div className="mm-title-area">
          <h1 className="mm-title">dzerkout</h1>
          <p className="mm-tagline">Build. Plan. Perform.</p>
        </div>
      </div>

      {/* Three-zone dashboard */}
      <div className="mm-content">
        <div className="mm-col">
          {LEFT_NAV.map(({ to, label, icon }) => (
            <NavBtn key={to} to={to} label={label} icon={icon} navigate={navigate} />
          ))}
        </div>

        <div className="mm-center">
          <img src="/dzerkout-logo-mark.svg" alt="dzerkout" className="mm-logo-img" />
        </div>

        <div className="mm-col">
          {RIGHT_NAV.map(({ to, label, icon }) => (
            <NavBtn
              key={to}
              to={to}
              label={label}
              icon={icon}
              navigate={navigate}
              activeBadge={label === "Runner" && hasSession}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
