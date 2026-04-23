import { HashRouter, NavLink, Route, Routes } from "react-router-dom";
import { usePlatform } from "./hooks/usePlatform";
import { useSessionRecovery } from "./hooks/useSessionRecovery";
import { useSessionStore } from "./store/sessionStore";
import { useUiStore } from "./store/uiStore";
import { ConfirmModal } from "./components/ConfirmModal";
import ExerciseLibrary from "./screens/ExerciseLibrary";
import SetTemplateBuilder from "./screens/SetTemplateBuilder";
import WorkoutTemplateBuilder from "./screens/WorkoutTemplateBuilder";
import ActiveWorkoutRunner from "./screens/ActiveWorkoutRunner";
import WorkoutHistory from "./screens/WorkoutHistory";

const BASE_NAV: { to: string; label: string }[] = [
  { to: "/exercises", label: "Exercises" },
  { to: "/sets", label: "Sets" },
  { to: "/workouts", label: "Workouts" },
  { to: "/history", label: "History" },
];

// Rendered inside HashRouter so useNavigate (and useSessionRecovery) have router context.
function AppShell() {
  useSessionRecovery();
  const sessionId = useSessionStore((s) => s.sessionId);
  const confirmModal = useUiStore((s) => s.confirmModal);
  const closeConfirmModal = useUiStore((s) => s.closeConfirmModal);

  const nav = sessionId
    ? [...BASE_NAV.slice(0, 3), { to: "/runner", label: "Runner" }, BASE_NAV[3]]
    : BASE_NAV;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh" }}>
      <main style={{ flex: 1, overflow: "auto" }}>
        <Routes>
          <Route path="/" element={<ExerciseLibrary />} />
          <Route path="/exercises" element={<ExerciseLibrary />} />
          <Route path="/sets" element={<SetTemplateBuilder />} />
          <Route path="/sets/:id" element={<SetTemplateBuilder />} />
          <Route path="/workouts" element={<WorkoutTemplateBuilder />} />
          <Route path="/workouts/:id" element={<WorkoutTemplateBuilder />} />
          <Route path="/runner" element={<ActiveWorkoutRunner />} />
          <Route path="/history" element={<WorkoutHistory />} />
        </Routes>
      </main>

      <nav style={navStyle}>
        {nav.map(({ to, label }) => (
          <NavLink key={to} to={to} style={({ isActive }) => linkStyle(isActive)}>
            {label}
          </NavLink>
        ))}
      </nav>

      {confirmModal && (
        <ConfirmModal
          title="Workout in progress"
          message={confirmModal.message}
          confirmLabel={confirmModal.confirmLabel}
          onConfirm={() => { confirmModal.onConfirm(); closeConfirmModal(); }}
          onCancel={() => { confirmModal.onCancel(); closeConfirmModal(); }}
        />
      )}
    </div>
  );
}

export default function App() {
  usePlatform();
  return (
    <HashRouter>
      <AppShell />
    </HashRouter>
  );
}

const navStyle: React.CSSProperties = {
  display: "flex",
  borderTop: "1px solid #e5e7eb",
  background: "#fff",
};

const linkStyle = (isActive: boolean): React.CSSProperties => ({
  flex: 1,
  padding: "10px 4px",
  textAlign: "center",
  fontSize: 12,
  fontWeight: isActive ? 600 : 400,
  color: isActive ? "#2563eb" : "#6b7280",
  textDecoration: "none",
});
