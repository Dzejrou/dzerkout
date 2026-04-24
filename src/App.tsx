import { HashRouter, Route, Routes, useLocation } from "react-router-dom";
import { usePlatform } from "./hooks/usePlatform";
import { useSessionRecovery } from "./hooks/useSessionRecovery";
import { useUiStore } from "./store/uiStore";
import { ConfirmModal } from "./components/ConfirmModal";
import MainMenu from "./screens/MainMenu";
import ExerciseLibrary from "./screens/ExerciseLibrary";
import SetTemplateBuilder from "./screens/SetTemplateBuilder";
import WorkoutTemplateBuilder from "./screens/WorkoutTemplateBuilder";
import ActiveWorkoutRunner from "./screens/ActiveWorkoutRunner";
import WorkoutHistory from "./screens/WorkoutHistory";

// Rendered inside HashRouter so useNavigate (and useSessionRecovery) have router context.
function AppShell() {
  useSessionRecovery();
  const confirmModal = useUiStore((s) => s.confirmModal);
  const closeConfirmModal = useUiStore((s) => s.closeConfirmModal);
  const location = useLocation();
  const isRunner = location.pathname === "/runner";

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh" }}>
      <main style={{ flex: 1, minHeight: 0, overflow: isRunner ? "hidden" : "auto" }}>
        <Routes>
          <Route path="/" element={<MainMenu />} />
          <Route path="/exercises" element={<ExerciseLibrary />} />
          <Route path="/sets" element={<SetTemplateBuilder />} />
          <Route path="/sets/:id" element={<SetTemplateBuilder />} />
          <Route path="/workouts" element={<WorkoutTemplateBuilder />} />
          <Route path="/workouts/:id" element={<WorkoutTemplateBuilder />} />
          <Route path="/runner" element={<ActiveWorkoutRunner />} />
          <Route path="/history" element={<WorkoutHistory />} />
        </Routes>
      </main>

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
