import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { sessionsApi } from "../../api/sessions";
import { useSessionStore } from "../../store/sessionStore";
import { useUiStore } from "../../store/uiStore";
import { useElapsedMs } from "../../hooks/useTimer";

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
    sessionId,
    sessionStatus,
    sets,
    exercises,
    currentSetId,
    currentExerciseId,
    pausedAt,
    load,
    clear,
  } = useSessionStore();

  const elapsedMs = useElapsedMs();
  const [pending, setPending] = useState<string | null>(null); // which action is pending
  const [error, setError] = useState<string | null>(null);

  // Keyboard shortcut handler ref — updated each render so the stable listener
  // always calls the latest closure without stale captures.
  const keyHandlerRef = useRef<((e: KeyboardEvent) => void) | null>(null);
  keyHandlerRef.current = null; // reset; overwritten below when in-progress

  useEffect(() => {
    if (isAndroid) return;
    const listener = (e: KeyboardEvent) => keyHandlerRef.current?.(e);
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, [isAndroid]);

  // ── No session ──────────────────────────────────────────────────────────────
  if (!sessionId) {
    return (
      <div style={centeredStyle}>
        <p style={{ color: "#6b7280" }}>No active session.</p>
        <button onClick={() => navigate("/workouts")} style={secondaryBtnStyle}>
          ← Workouts
        </button>
      </div>
    );
  }

  const currentExercise = exercises.find((e) => e.id === currentExerciseId) ?? null;
  const currentSet = sets.find((s) => s.id === currentSetId) ?? null;
  const setIndex = currentSet ? sets.indexOf(currentSet) : -1;
  const isPaused = pausedAt !== null;

  const isAtFirstExercise =
    currentExercise !== null &&
    currentSet !== null &&
    sets.indexOf(currentSet) === 0 &&
    exercises.filter((e) => e.workout_session_set_id === currentSet.id).indexOf(currentExercise) === 0;

  const isAtLastExercise = (() => {
    if (!currentExercise || !currentSet) return false;
    const setExs = exercises.filter((e) => e.workout_session_set_id === currentSet.id);
    const isLastInSet = setExs[setExs.length - 1]?.id === currentExercise.id;
    if (!isLastInSet) return false;
    return sets[sets.length - 1]?.id === currentSet.id;
  })();

  async function run<T>(key: string, fn: () => Promise<T>): Promise<T | null> {
    if (pending) return null;
    setError(null);
    setPending(key);
    try {
      return await fn();
    } catch (e) {
      setError(String(e));
      return null;
    } finally {
      setPending(null);
    }
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
      navigate("/workouts");
    }

    return (
      <div style={pageStyle}>
        <h2 style={headingStyle}>Ready to start?</h2>
        <p style={{ color: "#6b7280", marginBottom: 16 }}>
          {sets.length} set{sets.length !== 1 ? "s" : ""} · {exercises.length} exercise
          {exercises.length !== 1 ? "s" : ""}
        </p>

        <div style={{ maxWidth: 360, margin: "0 auto 20px" }}>
          {sets.map((s, i) => {
            const setExs = exercises.filter((e) => e.workout_session_set_id === s.id);
            return (
              <div key={s.id} style={setCardStyle}>
                <p style={{ fontSize: 12, color: "#6b7280", margin: "0 0 4px" }}>Set {i + 1}</p>
                {setExs.map((e) => (
                  <div key={e.id} style={{ fontSize: 14, color: "#111827", padding: "2px 0" }}>
                    {e.display_name}
                    {e.duration_hint_sec != null && (
                      <span style={{ color: "#9ca3af", fontSize: 12 }}> · {e.duration_hint_sec}s</span>
                    )}
                  </div>
                ))}
              </div>
            );
          })}
        </div>

        {error && <p style={errorStyle}>{error}</p>}
        <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
          <button onClick={handleDiscard} disabled={!!pending} style={secondaryBtnStyle}>
            Discard
          </button>
          <button onClick={handleStart} disabled={!!pending} style={startBtnStyle}>
            {pending === "start" ? "Starting…" : "▶ Start Workout"}
          </button>
        </div>
      </div>
    );
  }

  // ── In-progress controls ─────────────────────────────────────────────────────

  async function handlePause() {
    if (!currentSetId) return;
    const payload = await run("pause", () =>
      sessionsApi.pause(sessionId!, currentSetId)
    );
    if (payload) load(payload);
  }

  async function handleResume() {
    if (!currentSetId) return;
    const payload = await run("resume", () =>
      sessionsApi.resume(sessionId!, currentSetId)
    );
    if (payload) load(payload);
  }

  async function handleNext() {
    if (!currentExerciseId) return;
    if (isAtLastExercise) {
      showConfirm({
        message: "That was the last exercise. Finish workout?",
        confirmLabel: "Finish",
        onConfirm: doFinish,
        onCancel: () => {},
      });
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
      // If there's no current exercise after skip, last was skipped — offer finish
      if (!payload.current_exercise_id) {
        showConfirm({
          message: "All remaining exercises skipped. Finish workout?",
          confirmLabel: "Finish",
          onConfirm: doFinish,
          onCancel: () => {},
        });
      }
    }
  }

  function doFinish() {
    run("finish", () => sessionsApi.finish(sessionId!)).then((session) => {
      if (session) {
        clear();
        navigate("/history");
      }
    });
  }

  function handleFinish() {
    showConfirm({
      message: "Finish this workout session?",
      confirmLabel: "Finish",
      onConfirm: doFinish,
      onCancel: () => {},
    });
  }

  function handleAbandon() {
    showConfirm({
      message: "Abandon this session? It will not appear in your history.",
      confirmLabel: "Abandon",
      onConfirm: async () => {
        if (pending) return;
        setError(null);
        setPending("abandon");
        try {
          await sessionsApi.abandon(sessionId!);
          clear();
          navigate("/workouts");
        } catch (e) {
          setError(String(e));
        } finally {
          setPending(null);
        }
      },
      onCancel: () => {},
    });
  }

  // ── Keyboard shortcuts (desktop only) ───────────────────────────────────────
  keyHandlerRef.current = (e: KeyboardEvent) => {
    const target = e.target as HTMLElement;
    if (
      target.tagName === "INPUT" ||
      target.tagName === "TEXTAREA" ||
      target.tagName === "SELECT" ||
      target.isContentEditable
    ) return;
    if (e.repeat) return;
    if (e.key === "ArrowRight") { e.preventDefault(); void handleNext(); }
    if (e.key === "ArrowLeft")  { e.preventDefault(); void handlePrev(); }
    if (e.key === " ")          { e.preventDefault(); void (isPaused ? handleResume() : handlePause()); }
  };

  // ── In-progress layout ───────────────────────────────────────────────────────

  return (
    <div style={pageStyle}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <span style={{ fontSize: 12, color: "#6b7280" }}>
          Set {setIndex + 1} of {sets.length}
        </span>
        <div style={{ display: "flex", gap: 6 }}>
          <button onClick={handleFinish} disabled={!!pending} style={finishBtnStyle}>
            Finish
          </button>
          <button onClick={handleAbandon} disabled={!!pending} style={abandonBtnStyle}>
            Abandon
          </button>
        </div>
      </div>

      {/* Main timer */}
      <div style={timerBoxStyle}>
        <span style={timerTextStyle}>{formatTime(elapsedMs)}</span>
        {isPaused && <span style={{ fontSize: 13, color: "#f59e0b", marginTop: 2 }}>Paused</span>}
      </div>

      {/* Current exercise */}
      <div style={{ marginBottom: 16, textAlign: "center" }}>
        <h2 style={{ ...headingStyle, fontSize: 24, marginBottom: 4 }}>
          {currentExercise?.display_name ?? "—"}
        </h2>
        {currentExercise?.duration_hint_sec != null && (
          <p style={{ color: "#6b7280", margin: "0 0 4px", fontSize: 14 }}>
            {currentExercise.duration_hint_sec}s hint
          </p>
        )}
        {currentExercise?.notes && (
          <p style={{ fontSize: 13, color: "#374151", margin: 0 }}>{currentExercise.notes}</p>
        )}
      </div>

      {/* Controls */}
      <div style={controlsStyle}>
        <button
          onClick={handlePrev}
          disabled={!!pending || isAtFirstExercise}
          style={navBtnStyle}
          title="Previous exercise"
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
            : isPaused
            ? "▶ Resume"
            : "⏸ Pause"}
        </button>

        <button
          onClick={handleNext}
          disabled={!!pending || !currentExerciseId}
          style={navBtnStyle}
          title={isAtLastExercise ? "Finish" : "Next exercise"}
        >
          {isAtLastExercise ? "Finish →" : "Next →"}
        </button>
      </div>

      {/* Skip */}
      <div style={{ textAlign: "center", marginTop: 8 }}>
        <button
          onClick={handleSkip}
          disabled={!!pending || !currentExerciseId}
          style={skipBtnStyle}
        >
          Skip
        </button>
      </div>

      {error && <p style={{ ...errorStyle, textAlign: "center", marginTop: 8 }}>{error}</p>}

      {/* Exercise queue */}
      <div style={{ marginTop: 20 }}>
        <p style={{ fontSize: 12, color: "#6b7280", margin: "0 0 6px" }}>Exercise queue</p>
        {sets.map((s, si) => (
          <div key={s.id} style={{ marginBottom: 10 }}>
            {sets.length > 1 && (
              <p style={{ fontSize: 11, color: "#9ca3af", margin: "0 0 3px" }}>
                — Set {si + 1} —
              </p>
            )}
            {exercises
              .filter((e) => e.workout_session_set_id === s.id)
              .map((e) => {
                const isCurrent = e.id === currentExerciseId;
                const isDone = e.status === "completed";
                const isSkipped = e.status === "skipped";
                return (
                  <div
                    key={e.id}
                    style={{
                      ...queueRowStyle,
                      background: isCurrent ? "#eff6ff" : isDone ? "#f0fdf4" : "#fafafa",
                      borderColor: isCurrent ? "#3b82f6" : isDone ? "#86efac" : "#e5e7eb",
                      opacity: isSkipped ? 0.45 : 1,
                    }}
                  >
                    <span style={{ fontSize: 14, flex: 1, textDecoration: isSkipped ? "line-through" : "none" }}>
                      {e.display_name}
                    </span>
                    <span style={{ fontSize: 12, color: "#9ca3af", marginLeft: 8 }}>
                      {isDone ? "✓" : isCurrent ? "▶" : isSkipped ? "skip" : ""}
                    </span>
                  </div>
                );
              })}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const pageStyle: React.CSSProperties = {
  padding: "12px 16px",
  maxWidth: 560,
  margin: "0 auto",
};
const centeredStyle: React.CSSProperties = { padding: 32, textAlign: "center" };
const headingStyle: React.CSSProperties = { fontSize: 20, fontWeight: 700, margin: "0 0 8px" };
const setCardStyle: React.CSSProperties = {
  background: "#f8fafc",
  border: "1px solid #e5e7eb",
  borderRadius: 8,
  padding: "10px 12px",
  marginBottom: 8,
};
const timerBoxStyle: React.CSSProperties = {
  textAlign: "center",
  padding: "16px 0",
  marginBottom: 8,
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
};
const timerTextStyle: React.CSSProperties = {
  fontSize: 52,
  fontWeight: 700,
  fontVariantNumeric: "tabular-nums",
  letterSpacing: "0.02em",
  color: "#111827",
};
const controlsStyle: React.CSSProperties = {
  display: "flex",
  gap: 8,
  justifyContent: "center",
  alignItems: "center",
  marginBottom: 4,
};
const navBtnStyle: React.CSSProperties = {
  padding: "10px 18px",
  borderRadius: 8,
  border: "1px solid #d1d5db",
  background: "#f9fafb",
  cursor: "pointer",
  fontSize: 14,
  fontWeight: 600,
};
const pauseBtnStyle: React.CSSProperties = {
  padding: "12px 24px",
  borderRadius: 8,
  border: "none",
  background: "#1d4ed8",
  color: "#fff",
  cursor: "pointer",
  fontWeight: 700,
  fontSize: 16,
  minWidth: 120,
};
const skipBtnStyle: React.CSSProperties = {
  padding: "6px 18px",
  borderRadius: 6,
  border: "1px solid #e5e7eb",
  background: "none",
  cursor: "pointer",
  fontSize: 13,
  color: "#6b7280",
};
const startBtnStyle: React.CSSProperties = {
  padding: "12px 28px",
  borderRadius: 8,
  border: "none",
  background: "#16a34a",
  color: "#fff",
  cursor: "pointer",
  fontWeight: 700,
  fontSize: 16,
};
const secondaryBtnStyle: React.CSSProperties = {
  padding: "10px 16px",
  borderRadius: 8,
  border: "1px solid #d1d5db",
  background: "#f9fafb",
  cursor: "pointer",
  fontSize: 14,
};
const finishBtnStyle: React.CSSProperties = {
  padding: "6px 14px",
  borderRadius: 6,
  border: "none",
  background: "#16a34a",
  color: "#fff",
  cursor: "pointer",
  fontSize: 13,
  fontWeight: 600,
};
const abandonBtnStyle: React.CSSProperties = {
  padding: "6px 14px",
  borderRadius: 6,
  border: "1px solid #fca5a5",
  background: "#fff",
  color: "#dc2626",
  cursor: "pointer",
  fontSize: 13,
};
const queueRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  padding: "6px 10px",
  borderRadius: 6,
  border: "1px solid #e5e7eb",
  marginBottom: 4,
};
const errorStyle: React.CSSProperties = { color: "#dc2626", fontSize: 13 };
