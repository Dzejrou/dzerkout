import { useEffect, useLayoutEffect } from "react";
import { HashRouter, Route, Routes, useLocation } from "react-router-dom";
import { usePlatform } from "./hooks/usePlatform";
import { useSessionRecovery } from "./hooks/useSessionRecovery";
import { useUiStore } from "./store/uiStore";
import { useSettingsStore } from "./store/settingsStore";
import { fontPresets } from "./theme/fontPresets";
import { allThemes, applyThemeToDOM } from "./theme/tokens";
import { ConfirmModal } from "./components/ConfirmModal";
import MainMenu from "./screens/MainMenu";
import ExerciseLibrary from "./screens/ExerciseLibrary";
import SetTemplateBuilder from "./screens/SetTemplateBuilder";
import WorkoutTemplateBuilder from "./screens/WorkoutTemplateBuilder";
import ActiveWorkoutRunner from "./screens/ActiveWorkoutRunner";
import WorkoutHistory from "./screens/WorkoutHistory";
import Stats from "./screens/Stats";
import Settings from "./screens/Settings";

// Applies the stored font preset to the CSS variable on the document root.
// Runs outside the router because font application needs no routing context.
function useFontPreset() {
  const fontPreset = useSettingsStore((s) => s.fontPreset);
  useEffect(() => {
    document.documentElement.style.setProperty(
      "--font-family",
      fontPresets[fontPreset].stack,
    );
  }, [fontPreset]);
}

// Applies the selected theme's concrete color values as CSS custom properties
// on the document root, so every inline style using `var(--name)` references
// (via the `tokens` object) resolves to the correct color.
//
// useLayoutEffect is intentional: it fires synchronously after the DOM is updated
// but before the browser paints, eliminating any first-frame flash when a
// non-default theme was persisted.
function useThemeApplicator() {
  const theme = useSettingsStore((s) => s.theme);
  useLayoutEffect(() => {
    applyThemeToDOM(allThemes[theme] ?? allThemes.dark);
  }, [theme]);
}

// Rendered inside HashRouter so useNavigate (and useSessionRecovery) have router context.
function AppShell() {
  useSessionRecovery();
  useFontPreset();
  useThemeApplicator();
  const confirmModal = useUiStore((s) => s.confirmModal);
  const closeConfirmModal = useUiStore((s) => s.closeConfirmModal);
  const location = useLocation();
  const noScroll = ["/runner", "/workouts", "/history", "/sets", "/exercises", "/stats", "/settings"].includes(location.pathname);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh" }}>
      <main style={{ flex: 1, minHeight: 0, overflow: noScroll ? "hidden" : "auto" }}>
        <Routes>
          <Route path="/" element={<MainMenu />} />
          <Route path="/exercises" element={<ExerciseLibrary />} />
          <Route path="/sets" element={<SetTemplateBuilder />} />
          <Route path="/sets/:id" element={<SetTemplateBuilder />} />
          <Route path="/workouts" element={<WorkoutTemplateBuilder />} />
          <Route path="/workouts/:id" element={<WorkoutTemplateBuilder />} />
          <Route path="/runner" element={<ActiveWorkoutRunner />} />
          <Route path="/history" element={<WorkoutHistory />} />
          <Route path="/stats" element={<Stats />} />
          <Route path="/settings" element={<Settings />} />
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
