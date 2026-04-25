import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { sessionsApi } from "../../api/sessions";
import { useSessionStore } from "../../store/sessionStore";
import { useUiStore } from "../../store/uiStore";
import { useSettingsStore } from "../../store/settingsStore";
import { useElapsedMs, useExerciseElapsedMs } from "../../hooks/useTimer";

function formatTime(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export default function ActiveWorkoutRunner() {
  const navigate = useNavigate();
  const showConfirm = useUiStore((s) => s.showConfirmModal);
  const isAndroid = useUiStore((s) => s.isAndroid);
  const {
    sessionId, sessionStatus, sets, exercises,
    currentSetId, currentExerciseId, pausedAt, load, clear,
  } = useSessionStore();

  const elapsedMs = useElapsedMs();
  const { elapsedMs: exerciseElapsedMs, durationHintSec } = useExerciseElapsedMs();
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const keyHandlerRef = useRef<((e: KeyboardEvent) => void) | null>(null);
  keyHandlerRef.current = null;

  useEffect(() => {
    if (isAndroid) return;
    const listener = (e: KeyboardEvent) => keyHandlerRef.current?.(e);
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, [isAndroid]);

  // ── Auto-advance ────────────────────────────────────────────────────────────
  const autoAdvance = useSettingsStore((s) => s.autoAdvance);
  // Filled in by the in-progress section each render; null during draft/no-session.
  const nextHandlerRef = useRef<(() => void) | null>(null);
  nextHandlerRef.current = null;
  // Tracks which exercise was last auto-advanced to prevent repeated triggers.
  const autoAdvancedExerciseRef = useRef<string | null>(null);

  useEffect(() => {
    if (!autoAdvance) return;
    if (pausedAt !== null) return;
    if (sessionStatus !== "in_progress") return;
    if (!currentExerciseId) return;
    if (durationHintSec == null) return;
    if (exerciseElapsedMs < durationHintSec * 1000) return;
    if (pending) return;
    if (autoAdvancedExerciseRef.current === currentExerciseId) return;
    if (!nextHandlerRef.current) return;

    autoAdvancedExerciseRef.current = currentExerciseId;
    nextHandlerRef.current();
  }, [autoAdvance, pausedAt, sessionStatus, currentExerciseId, durationHintSec, exerciseElapsedMs, pending]);

  // ── No session ──────────────────────────────────────────────────────────────
  if (!sessionId) {
    return (
      <div style={runnerRootStyle}>
        <div style={topBarStyle}>
          <button onClick={() => navigate("/")} style={backBtnStyle}>← Back</button>
        </div>
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <p style={{ color: "#8e8e93" }}>No active session.</p>
        </div>
      </div>
    );
  }

  const currentExercise = exercises.find((e) => e.id === currentExerciseId) ?? null;
  const currentSet = sets.find((s) => s.id === currentSetId) ?? null;
  const setIndex = currentSet ? sets.indexOf(currentSet) : -1;
  const isPaused = pausedAt !== null;

  const isAtFirstExercise =
    currentExercise !== null && currentSet !== null &&
    sets.indexOf(currentSet) === 0 &&
    exercises.filter((e) => e.workout_session_set_id === currentSet.id).indexOf(currentExercise) === 0;

  const isAtLastExercise = (() => {
    if (!currentExercise || !currentSet) return false;
    const setExs = exercises.filter((e) => e.workout_session_set_id === currentSet.id);
    if (setExs[setExs.length - 1]?.id !== currentExercise.id) return false;
    return sets[sets.length - 1]?.id === currentSet.id;
  })();

  async function run<T>(key: string, fn: () => Promise<T>): Promise<T | null> {
    if (pending) return null;
    setError(null);
    setPending(key);
    try { return await fn(); }
    catch (e) { setError(String(e)); return null; }
    finally { setPending(null); }
  }

  // ── Draft view ──────────────────────────────────────────────────────────────
  if (sessionStatus === "draft") {
    async function handleStart() {
      const payload = await run("start", () => sessionsApi.start(sessionId!));
      if (payload) load(payload);
    }
    async function handleDiscard() {
      const confirmed = await new Promise<boolean>((res) =>
        showConfirm({
          message: "Discard this session? All progress will be lost.",
          confirmLabel: "Discard",
          onConfirm: () => res(true),
          onCancel: () => res(false),
        })
      );
      if (!confirmed) return;
      await run("discard", () => sessionsApi.discard(sessionId!));
      clear();
      navigate("/");
    }

    return (
      <div style={runnerRootStyle}>
        <div style={topBarStyle}>
          <button onClick={() => navigate("/")} style={backBtnStyle}>← Back</button>
        </div>
        <div style={{ flex: 1, padding: "24px 32px", overflowY: "auto" }}>
          <h2 style={{ color: "#f2f2f7", fontSize: 24, fontWeight: 700, margin: "0 0 8px" }}>
            Ready to start?
          </h2>
          <p style={{ color: "#8e8e93", marginBottom: 24 }}>
            {sets.length} set{sets.length !== 1 ? "s" : ""} · {exercises.length} exercise
            {exercises.length !== 1 ? "s" : ""}
          </p>
          <div style={{ maxWidth: 420, marginBottom: 28 }}>
            {sets.map((s, i) => {
              const setExs = exercises.filter((e) => e.workout_session_set_id === s.id);
              return (
                <div key={s.id} style={draftSetCardStyle}>
                  <p style={{ fontSize: 11, color: "#8e8e93", margin: "0 0 8px", textTransform: "uppercase", letterSpacing: "0.07em" }}>
                    Set {i + 1}
                  </p>
                  {setExs.map((e) => (
                    <div key={e.id} style={{ fontSize: 14, color: "#d1d5db", padding: "3px 0", display: "flex", justifyContent: "space-between" }}>
                      <span>{e.display_name}</span>
                      {e.duration_hint_sec != null && (
                        <span style={{ color: "#6b7280", fontVariantNumeric: "tabular-nums" }}>
                          {formatTime(e.duration_hint_sec * 1000)}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
          {error && <p style={errorStyle}>{error}</p>}
          <div style={{ display: "flex", gap: 12 }}>
            <button onClick={handleDiscard} disabled={!!pending} style={draftSecBtnStyle}>Discard</button>
            <button onClick={handleStart} disabled={!!pending} style={draftStartBtnStyle}>
              {pending === "start" ? "Starting…" : "▶ Start Workout"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── In-progress controls ──────────────────────────────────────────────────
  async function handlePause() {
    if (!currentSetId) return;
    const payload = await run("pause", () => sessionsApi.pause(sessionId!, currentSetId));
    if (payload) load(payload);
  }
  async function handleResume() {
    if (!currentSetId) return;
    const payload = await run("resume", () => sessionsApi.resume(sessionId!, currentSetId));
    if (payload) load(payload);
  }
  async function handleNext() {
    if (!currentExerciseId) return;
    if (isAtLastExercise) {
      showConfirm({ message: "That was the last exercise. Finish workout?", confirmLabel: "Finish", onConfirm: doFinish, onCancel: () => {} });
      return;
    }
    const payload = await run("next", () => sessionsApi.advance(sessionId!));
    if (payload) load(payload);
  }
  async function handlePrev() {
    if (isAtFirstExercise) return;
    const payload = await run("prev", () => sessionsApi.retreat(sessionId!));
    if (payload) load(payload);
  }
  async function handleSkip() {
    if (!currentExerciseId) return;
    const payload = await run("skip", () => sessionsApi.skip(sessionId!, currentExerciseId));
    if (payload) {
      load(payload);
      if (!payload.current_exercise_id) {
        showConfirm({ message: "All remaining exercises skipped. Finish workout?", confirmLabel: "Finish", onConfirm: doFinish, onCancel: () => {} });
      }
    }
  }
  function doFinish() {
    run("finish", () => sessionsApi.finish(sessionId!)).then((session) => {
      if (session) { clear(); navigate("/history"); }
    });
  }
  function handleFinish() {
    showConfirm({ message: "Finish this workout session?", confirmLabel: "Finish", onConfirm: doFinish, onCancel: () => {} });
  }
  function handleAbandon() {
    showConfirm({
      message: "Abandon this session? It will not appear in your history.",
      confirmLabel: "Abandon",
      onConfirm: async () => {
        if (pending) return;
        setError(null);
        setPending("abandon");
        try { await sessionsApi.abandon(sessionId!); clear(); navigate("/"); }
        catch (e) { setError(String(e)); }
        finally { setPending(null); }
      },
      onCancel: () => {},
    });
  }

  // Expose handleNext to the auto-advance effect running above the early returns.
  nextHandlerRef.current = handleNext;

  // ── Keyboard shortcuts (desktop only) ───────────────────────────────────────
  keyHandlerRef.current = (e: KeyboardEvent) => {
    const target = e.target as HTMLElement;
    if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" ||
        target.tagName === "SELECT" || target.isContentEditable) return;
    if (e.repeat) return;
    if (e.key === "ArrowRight") { e.preventDefault(); void handleNext(); }
    if (e.key === "ArrowLeft")  { e.preventDefault(); void handlePrev(); }
    if (e.key === " ")          { e.preventDefault(); void (isPaused ? handleResume() : handlePause()); }
  };

  // ── Flat exercise list for queue ──────────────────────────────────────────
  const allExercises = sets.flatMap((s) =>
    exercises.filter((e) => e.workout_session_set_id === s.id)
  );
  const currentGlobalIdx = allExercises.findIndex((e) => e.id === currentExerciseId);

  // ── In-progress layout ────────────────────────────────────────────────────
  return (
    <div style={runnerRootStyle}>
      {/* Top bar */}
      <div style={topBarStyle}>
        <button onClick={() => navigate("/")} style={backBtnStyle}>← Back</button>
      </div>

      {/* Main content: left timers + right queue */}
      <div style={mainAreaStyle}>
        {/* Left: timer panels */}
        <div style={leftColStyle}>
          {/* Set timer */}
          <div style={timerPanelStyle}>
            <span style={panelLabelStyle}>SET TIME</span>
            <span style={bigClockStyle}>{formatTime(elapsedMs)}</span>
            {isPaused
              ? <span style={pausedBadgeStyle}>● PAUSED</span>
              : <span style={setIndexStyle}>Set {setIndex + 1} of {sets.length}</span>
            }
            {isPaused && <span style={setIndexStyle}>Set {setIndex + 1} of {sets.length}</span>}
          </div>

          {/* Exercise timer */}
          <div style={timerPanelStyle}>
            <span style={panelLabelStyle}>EXERCISE TIME</span>
            {durationHintSec != null ? (
              <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                <span style={exClockCurrentStyle}>{formatTime(exerciseElapsedMs)}</span>
                <span style={{ color: "#4b5563", fontSize: "clamp(22px, 3.5vw, 56px)", fontWeight: 300, lineHeight: 1 }}>/</span>
                <span style={exClockTargetStyle}>{formatTime(durationHintSec * 1000)}</span>
              </div>
            ) : (
              <span style={exClockCurrentStyle}>{formatTime(exerciseElapsedMs)}</span>
            )}
            <span style={exNameStyle}>{currentExercise?.display_name ?? "—"}</span>
          </div>

          {error && <p style={errorStyle}>{error}</p>}
        </div>

        {/* Right: exercise queue */}
        <div style={queueColStyle}>
          <div style={chevronStyle}>∧</div>

          {([-2, -1, 0, 1, 2] as const).map((offset) => {
            const idx = currentGlobalIdx + offset;
            const ex = idx >= 0 && idx < allExercises.length ? allExercises[idx] : null;
            const isCurrent = offset === 0;
            const dist = Math.abs(offset);
            const opacity = dist === 2 ? 0.25 : dist === 1 ? 0.58 : 1;
            const scale = dist === 2 ? 0.9 : dist === 1 ? 0.952 : 1;

            return (
              <div
                key={offset}
                style={{
                  ...queueCardBaseStyle,
                  opacity,
                  transform: `scale(${scale})`,
                  border: isCurrent
                    ? "1.5px solid rgba(255,255,255,0.75)"
                    : "1px solid rgba(255,255,255,0.07)",
                  background: isCurrent
                    ? "rgba(255,255,255,0.07)"
                    : "rgba(255,255,255,0.02)",
                }}
              >
                {isCurrent && (
                  <span style={queueCurrentArrowStyle}>◄</span>
                )}
                {ex ? (
                  <>
                    <span style={{ ...queueNumStyle, fontWeight: isCurrent ? 600 : 400 }}>
                      {idx + 1}
                    </span>
                    <span style={{ ...queueNameStyle, fontWeight: isCurrent ? 700 : 400, fontSize: isCurrent ? 80 : 66 }}>
                      {ex.display_name}
                    </span>
                    {ex.duration_hint_sec != null && (
                      <span style={queueDurStyle}>{formatTime(ex.duration_hint_sec * 1000)}</span>
                    )}
                  </>
                ) : (
                  <span style={{ color: "rgba(255,255,255,0.12)", fontSize: 13, flex: 1, textAlign: "center" }}>·</span>
                )}
              </div>
            );
          })}

          <div style={chevronStyle}>∨</div>
        </div>
      </div>

      {/* Bottom controls */}
      <div style={bottomBarStyle}>
        <div style={primaryCtrlsStyle}>
          <button
            onClick={handlePrev}
            disabled={!!pending || isAtFirstExercise}
            style={navBtnStyle(isAtFirstExercise || !!pending)}
          >
            ← Prev
          </button>
          <button
            onClick={isPaused ? handleResume : handlePause}
            disabled={!!pending || !currentSetId}
            style={pauseBtnStyle}
          >
            {pending === "pause" || pending === "resume"
              ? "…"
              : isPaused ? "▶ Resume" : "⏸ Pause"}
          </button>
          <button
            onClick={handleNext}
            disabled={!!pending || !currentExerciseId}
            style={navBtnStyle(!currentExerciseId || !!pending)}
          >
            Next →
          </button>
        </div>

        <div style={secondaryCtrlsStyle}>
          <button onClick={handleSkip} disabled={!!pending || !currentExerciseId} style={secBtnStyle(!!pending || !currentExerciseId)}>
            <span style={secIconStyle}>⏭</span>
            <span style={secLabelStyle}>Skip</span>
          </button>
          <button onClick={handleFinish} disabled={!!pending} style={secBtnStyle(!!pending)}>
            <span style={secIconStyle}>⚑</span>
            <span style={secLabelStyle}>Finish</span>
          </button>
          <button onClick={handleAbandon} disabled={!!pending} style={secBtnStyle(!!pending)}>
            <span style={secIconStyle}>✕</span>
            <span style={secLabelStyle}>Abandon</span>
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const runnerRootStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  height: "100%",
  background: "#1c1c1e",
  color: "#f2f2f7",
  overflow: "hidden",
  userSelect: "none",
};

const topBarStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  padding: "10px 16px",
  flexShrink: 0,
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
};

const mainAreaStyle: React.CSSProperties = {
  flex: 1,
  display: "flex",
  gap: 12,
  padding: "4px 16px 8px",
  overflow: "hidden",
  minHeight: 0,
};

// ── Left column ───────────────────────────────────────────────────────────────

const leftColStyle: React.CSSProperties = {
  flex: "0 0 48%",
  display: "flex",
  flexDirection: "column",
  gap: 10,
  overflow: "hidden",
};

const timerPanelStyle: React.CSSProperties = {
  background: "#2c2c2e",
  border: "1px solid rgba(255,255,255,0.06)",
  borderRadius: 14,
  padding: "16px 20px",
  display: "flex",
  flexDirection: "column",
  gap: 4,
  flex: 1,
  justifyContent: "center",
};

const panelLabelStyle: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  color: "#6b7280",
  letterSpacing: "0.12em",
  textTransform: "uppercase",
  marginBottom: 6,
};

const bigClockStyle: React.CSSProperties = {
  fontSize: "clamp(72px, 13vw, 200px)",
  fontWeight: 700,
  fontVariantNumeric: "tabular-nums",
  letterSpacing: "0.01em",
  color: "#f2f2f7",
  lineHeight: 1,
};

const pausedBadgeStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  color: "#f59e0b",
  letterSpacing: "0.08em",
  marginTop: 4,
};

const setIndexStyle: React.CSSProperties = {
  fontSize: 13,
  color: "#8e8e93",
  marginTop: 4,
};

const exClockCurrentStyle: React.CSSProperties = {
  fontSize: "clamp(56px, 9vw, 160px)",
  fontWeight: 700,
  fontVariantNumeric: "tabular-nums",
  color: "#f2f2f7",
  letterSpacing: "0.01em",
  lineHeight: 1,
};

const exClockTargetStyle: React.CSSProperties = {
  fontSize: "clamp(40px, 7vw, 120px)",
  fontWeight: 300,
  fontVariantNumeric: "tabular-nums",
  color: "#6b7280",
  letterSpacing: "0.01em",
  lineHeight: 1,
};

const exNameStyle: React.CSSProperties = {
  fontSize: 14,
  color: "#9ca3af",
  marginTop: 10,
};

// ── Queue column ──────────────────────────────────────────────────────────────

const queueColStyle: React.CSSProperties = {
  flex: 1,
  display: "flex",
  flexDirection: "column",
  justifyContent: "center",
  gap: 4,
  paddingLeft: 18,
  position: "relative",
  overflow: "hidden",
};

const chevronStyle: React.CSSProperties = {
  textAlign: "center",
  color: "rgba(255,255,255,0.18)",
  fontSize: 14,
  padding: "2px 0",
  flexShrink: 0,
  letterSpacing: 2,
};

const queueCardBaseStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  padding: "16px 18px",
  borderRadius: 10,
  position: "relative",
  flexShrink: 0,
  transition: "opacity 0.12s ease, transform 0.12s ease",
};

const queueCurrentArrowStyle: React.CSSProperties = {
  position: "absolute",
  left: -16,
  top: "50%",
  transform: "translateY(-50%)",
  color: "rgba(255,255,255,0.5)",
  fontSize: 11,
};

const queueNumStyle: React.CSSProperties = {
  fontSize: 16,
  color: "#8e8e93",
  minWidth: 24,
  textAlign: "right",
  flexShrink: 0,
};

const queueNameStyle: React.CSSProperties = {
  flex: 1,
  fontSize: 17,
  color: "#f2f2f7",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const queueDurStyle: React.CSSProperties = {
  fontSize: 16,
  color: "#6b7280",
  fontVariantNumeric: "tabular-nums",
  flexShrink: 0,
};

// ── Bottom bar ────────────────────────────────────────────────────────────────

const bottomBarStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "stretch",
  flexShrink: 0,
  borderTop: "1px solid rgba(255,255,255,0.07)",
};

const primaryCtrlsStyle: React.CSSProperties = {
  flex: 1,
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "12px 16px",
};

const secondaryCtrlsStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  borderLeft: "1px solid rgba(255,255,255,0.07)",
  padding: "8px 10px",
  gap: 2,
};

function navBtnStyle(disabled: boolean): React.CSSProperties {
  return {
    flex: 1,
    height: 44,
    padding: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
    border: "1px solid rgba(255,255,255,0.1)",
    background: disabled ? "rgba(255,255,255,0.02)" : "rgba(255,255,255,0.07)",
    color: disabled ? "#4b5563" : "#e5e7eb",
    cursor: disabled ? "not-allowed" : "pointer",
    fontSize: 14,
    fontWeight: 600,
  };
}

const pauseBtnStyle: React.CSSProperties = {
  flex: 1.5,
  height: 44,
  padding: 0,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  borderRadius: 10,
  border: "1px solid rgba(255,255,255,0.14)",
  background: "#3a3a3c",
  color: "#f2f2f7",
  cursor: "pointer",
  fontSize: 15,
  fontWeight: 700,
};

function secBtnStyle(disabled: boolean): React.CSSProperties {
  return {
    background: "none",
    border: "none",
    cursor: disabled ? "not-allowed" : "pointer",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 3,
    padding: "6px 12px",
    borderRadius: 8,
    color: disabled ? "#4b5563" : "#9ca3af",
    minWidth: 52,
  };
}

const secIconStyle: React.CSSProperties = {
  fontSize: 18,
  lineHeight: 1,
};

const secLabelStyle: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 600,
  letterSpacing: "0.05em",
  textTransform: "uppercase",
};

// ── Draft styles ──────────────────────────────────────────────────────────────

const draftSetCardStyle: React.CSSProperties = {
  background: "#2c2c2e",
  border: "1px solid rgba(255,255,255,0.06)",
  borderRadius: 10,
  padding: "12px 16px",
  marginBottom: 10,
};

const draftSecBtnStyle: React.CSSProperties = {
  padding: "10px 20px",
  borderRadius: 8,
  border: "1px solid rgba(255,255,255,0.14)",
  background: "rgba(255,255,255,0.06)",
  color: "#f2f2f7",
  cursor: "pointer",
  fontSize: 14,
};

const draftStartBtnStyle: React.CSSProperties = {
  padding: "10px 24px",
  borderRadius: 8,
  border: "none",
  background: "#2d6a3f",
  color: "#fff",
  cursor: "pointer",
  fontWeight: 700,
  fontSize: 15,
};

// ── Shared ────────────────────────────────────────────────────────────────────

const errorStyle: React.CSSProperties = {
  color: "#ef4444",
  fontSize: 13,
  marginTop: 8,
};
