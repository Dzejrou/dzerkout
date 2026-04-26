import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { sessionsApi } from "../../api/sessions";
import { useSessionStore } from "../../store/sessionStore";
import { useUiStore } from "../../store/uiStore";
import { useSettingsStore } from "../../store/settingsStore";
import { useElapsedMs, useExerciseElapsedMs } from "../../hooks/useTimer";
import { useCountdownCues } from "../../hooks/useCountdownCues";
import { tokens } from "../../theme/tokens";

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
    currentSetId, currentExerciseId, pausedAt, restPhase, load, clear,
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
  const autoStartNextSet = useSettingsStore((s) => s.autoStartNextSet);
  const soundCues = useSettingsStore((s) => s.soundCues);
  const runnerCardSize = useSettingsStore((s) => s.runnerCardSize);

  // ── Auto-advance exercises ──────────────────────────────────────────────────
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
    if (restPhase) return; // do not auto-advance during rest
    if (durationHintSec == null) return;
    if (exerciseElapsedMs < durationHintSec * 1000) return;
    if (pending) return;
    if (autoAdvancedExerciseRef.current === currentExerciseId) return;
    if (!nextHandlerRef.current) return;

    autoAdvancedExerciseRef.current = currentExerciseId;
    nextHandlerRef.current();
  }, [autoAdvance, pausedAt, sessionStatus, currentExerciseId, restPhase, durationHintSec, exerciseElapsedMs, pending]);

  // ── Auto-start next set (refs only — effect placed after restRemainingSec) ───
  // Filled in by the in-progress section each render; null outside that path.
  const startNextSetHandlerRef = useRef<(() => void) | null>(null);
  startNextSetHandlerRef.current = null;
  // Tracks which rest phase was last auto-started to prevent repeated triggers.
  const autoStartedRestRef = useRef<string | null>(null);

  // ── Rest-phase elapsed timer ────────────────────────────────────────────────
  // Tracks how many ms have passed since rest started (client-side, non-persisted).
  const [restElapsedMs, setRestElapsedMs] = useState(0);
  const restPhaseRef = useRef(restPhase);
  restPhaseRef.current = restPhase;
  useEffect(() => {
    if (!restPhase) { setRestElapsedMs(0); return; }
    const tick = () => {
      const elapsed = Date.now() - restPhaseRef.current!.rest_started_at_ms;
      setRestElapsedMs(Math.max(0, elapsed));
    };
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [restPhase?.next_set_id]); // re-run only when a new rest phase begins

  // ── Sound cues ──────────────────────────────────────────────────────────────
  // Exercise countdown: only active for timed exercises (durationHintSec != null).
  const exerciseRemainingSec =
    durationHintSec != null
      ? durationHintSec - exerciseElapsedMs / 1000
      : 0;
  // phaseId is null when there is no duration target → cues suppressed automatically.
  const exerciseCuePhaseId =
    durationHintSec != null && sessionStatus === "in_progress" && !restPhase
      ? currentExerciseId
      : null;
  useCountdownCues(
    exerciseRemainingSec,
    exerciseCuePhaseId,
    soundCues,
    pausedAt !== null,
  );

  // Rest countdown: active during between-set rest phases.
  const restRemainingSec =
    restPhase != null
      ? restPhase.rest_duration_sec - restElapsedMs / 1000
      : 0;
  useCountdownCues(
    restRemainingSec,
    restPhase?.next_set_id ?? null,
    soundCues,
    pausedAt !== null,
  );

  // ── Auto-start next set (effect) ────────────────────────────────────────────
  // restRemainingSec is now in scope. Fires when rest hits zero and the setting
  // is on; the guard ref prevents more than one call per rest phase.
  useEffect(() => {
    if (!autoStartNextSet) return;
    if (!restPhase) return;
    if (pausedAt !== null) return;
    if (sessionStatus !== "in_progress") return;
    if (restRemainingSec > 0) return;
    if (pending) return;
    if (autoStartedRestRef.current === restPhase.next_set_id) return;
    if (!startNextSetHandlerRef.current) return;

    autoStartedRestRef.current = restPhase.next_set_id;
    startNextSetHandlerRef.current();
  }, [autoStartNextSet, restPhase, pausedAt, sessionStatus, restRemainingSec, pending]);

  // ── No session ──────────────────────────────────────────────────────────────
  if (!sessionId) {
    return (
      <div style={runnerRootStyle}>
        <div style={topBarStyle}>
          <button onClick={() => navigate("/")} style={backBtnStyle}>← Back</button>
        </div>
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <p style={{ color: tokens.textSecondary }}>No active session.</p>
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
          <h2 style={{ color: tokens.textPrimary, fontSize: 24, fontWeight: 700, margin: "0 0 8px" }}>
            Ready to start?
          </h2>
          <p style={{ color: tokens.textSecondary, marginBottom: 24 }}>
            {sets.length} set{sets.length !== 1 ? "s" : ""} · {exercises.length} exercise
            {exercises.length !== 1 ? "s" : ""}
          </p>
          <div style={{ maxWidth: 420, marginBottom: 28 }}>
            {sets.map((s, i) => {
              const setExs = exercises.filter((e) => e.workout_session_set_id === s.id);
              return (
                <div key={s.id} style={draftSetCardStyle}>
                  <p style={{ fontSize: 11, color: tokens.textSecondary, margin: "0 0 8px", textTransform: "uppercase", letterSpacing: "0.07em" }}>
                    Set {i + 1}
                  </p>
                  {setExs.map((e) => (
                    <div key={e.id} style={{ fontSize: 14, color: tokens.iconText, padding: "3px 0", display: "flex", justifyContent: "space-between" }}>
                      <span>{e.display_name}</span>
                      {e.duration_hint_sec != null && (
                        <span style={{ color: tokens.textMuted, fontVariantNumeric: "tabular-nums" }}>
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
    // During rest, Prev cancels rest and re-opens the previous set.
    if (!restPhase && isAtFirstExercise) return;
    const payload = await run("prev", () => sessionsApi.retreat(sessionId!));
    if (payload) load(payload);
  }
  async function handleStartNextSet() {
    const payload = await run("startNextSet", () => sessionsApi.startNextSet(sessionId!));
    if (payload) load(payload);
  }
  async function handleSkip() {
    if (!currentExerciseId) return;
    const payload = await run("skip", () => sessionsApi.skip(sessionId!, currentExerciseId));
    if (payload) {
      load(payload);
      // Only offer Finish when there is genuinely no next exercise AND no rest phase.
      // (rest_phase non-null means the runner is between sets, not at the end of the workout.)
      if (!payload.current_exercise_id && !payload.rest_phase) {
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

  // Expose handlers to the effects that run above the early returns.
  nextHandlerRef.current = handleNext;
  startNextSetHandlerRef.current = handleStartNextSet;

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

  // ── Queue card scale ──────────────────────────────────────────────────────
  // Clamped defensively in case an out-of-range value was stored.
  const cardScale = Math.max(0.5, Math.min(2.0, runnerCardSize));
  // Vertical padding (baseline 16 px) — drives card height.
  const cardPadV = Math.round(16 * cardScale);
  // Exercise name font sizes (baseline 80 px current / 66 px adjacent).
  const cardFontCurrent = Math.round(80 * cardScale);
  const cardFontOther   = Math.round(66 * cardScale);
  // Number + duration label font size (baseline 16 px).
  const cardFontSmall   = Math.round(16 * cardScale);
  // Gap between cards in the queue column (baseline 4 px).
  const cardGap         = Math.round(4  * cardScale);

  // ── Flat exercise list for queue ──────────────────────────────────────────
  const allExercises = sets.flatMap((s) =>
    exercises.filter((e) => e.workout_session_set_id === s.id)
  );
  const currentGlobalIdx = allExercises.findIndex((e) => e.id === currentExerciseId);

  // ── Rest-phase view ───────────────────────────────────────────────────────
  if (restPhase) {
    const nextSet = sets.find((s) => s.id === restPhase.next_set_id);
    const nextSetIndex = nextSet ? sets.indexOf(nextSet) : -1;
    const nextSetExercises = nextSet
      ? exercises.filter((e) => e.workout_session_set_id === nextSet.id)
      : [];
    const restRemainingSec = Math.max(
      0,
      restPhase.rest_duration_sec - Math.floor(restElapsedMs / 1000),
    );
    const restOverdue = restElapsedMs > restPhase.rest_duration_sec * 1000;

    return (
      <div style={runnerRootStyle}>
        {/* Top bar */}
        <div style={topBarStyle}>
          <button onClick={() => navigate("/")} style={backBtnStyle}>← Back</button>
        </div>

        {/* Main content: rest timer + next-set preview */}
        <div style={mainAreaStyle}>
          {/* Left: rest timer */}
          <div style={leftColStyle}>
            <div style={timerPanelStyle}>
              <span style={panelLabelStyle}>REST</span>
              <span style={{ ...bigClockStyle, color: restOverdue ? tokens.amber : tokens.textPrimary }}>
                {formatTime(restRemainingSec * 1000)}
              </span>
              {restOverdue && (
                <span style={{ ...pausedBadgeStyle, color: tokens.amber }}>OVERDUE</span>
              )}
              <span style={setIndexStyle}>of {formatTime(restPhase.rest_duration_sec * 1000)}</span>
            </div>

            <div style={timerPanelStyle}>
              <span style={panelLabelStyle}>UP NEXT</span>
              <span style={{ fontSize: 14, color: tokens.textSecondary, marginBottom: 4 }}>
                Set {nextSetIndex + 1} of {sets.length}
              </span>
              {nextSetExercises.map((e) => (
                <div key={e.id} style={{ display: "flex", justifyContent: "space-between", gap: 8, padding: "3px 0", fontSize: 14, color: tokens.iconText }}>
                  <span>{e.display_name}</span>
                  {e.duration_hint_sec != null && (
                    <span style={{ color: tokens.textMuted, fontVariantNumeric: "tabular-nums" }}>
                      {formatTime(e.duration_hint_sec * 1000)}
                    </span>
                  )}
                </div>
              ))}
              {error && <p style={errorStyle}>{error}</p>}
            </div>
          </div>

          {/* Right: placeholder */}
          <div style={{ ...queueColStyle, justifyContent: "flex-start", paddingTop: 8 }}>
            <div style={{ textAlign: "center", color: tokens.textMuted, fontSize: 13, padding: "12px 0" }}>
              Rest between sets
            </div>
          </div>
        </div>

        {/* Bottom controls */}
        <div style={bottomBarStyle}>
          <div style={primaryCtrlsStyle}>
            <button
              onClick={handlePrev}
              disabled={!!pending}
              style={navBtnStyle(!!pending)}
            >
              ← Prev
            </button>
            <button
              onClick={handleStartNextSet}
              disabled={!!pending}
              style={startSetBtnStyle}
            >
              {pending === "startNextSet" ? "…" : "▶ Start Set"}
            </button>
          </div>

          <div style={secondaryCtrlsStyle}>
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
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <span style={exClockCurrentStyle}>{formatTime(exerciseElapsedMs)}</span>
                <span style={exClockTargetStyle}>of {formatTime(durationHintSec * 1000)}</span>
              </div>
            ) : (
              <span style={exClockCurrentStyle}>{formatTime(exerciseElapsedMs)}</span>
            )}
            <span style={exNameStyle}>{currentExercise?.display_name ?? "—"}</span>
          </div>

          {error && <p style={errorStyle}>{error}</p>}
        </div>

        {/* Right: exercise queue */}
        <div style={{ ...queueColStyle, gap: cardGap }}>
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
                  padding: `${cardPadV}px 18px`,
                  opacity,
                  transform: `scale(${scale})`,
                  border: isCurrent
                    ? "1.5px solid rgba(255,255,255,0.75)"
                    : `1px solid ${tokens.divider}`,
                  background: isCurrent
                    ? tokens.surfaceActive
                    : tokens.surfaceDisabled,
                }}
              >
                {isCurrent && (
                  <span style={queueCurrentArrowStyle}>◄</span>
                )}
                {ex ? (
                  <>
                    <span style={{ ...queueNumStyle, fontWeight: isCurrent ? 600 : 400, fontSize: cardFontSmall }}>
                      {idx + 1}
                    </span>
                    <span style={{ ...queueNameStyle, fontWeight: isCurrent ? 700 : 400, fontSize: isCurrent ? cardFontCurrent : cardFontOther }}>
                      {ex.display_name}
                    </span>
                    {ex.duration_hint_sec != null && (
                      <span style={{ ...queueDurStyle, fontSize: cardFontSmall }}>{formatTime(ex.duration_hint_sec * 1000)}</span>
                    )}
                  </>
                ) : (
                  <span style={{ color: tokens.border, fontSize: 13, flex: 1, textAlign: "center" }}>·</span>
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
  background: tokens.bg,
  color: tokens.textPrimary,
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
  background: tokens.surfaceActive,
  border: `1px solid ${tokens.borderStrong}`,
  borderRadius: 8,
  color: tokens.textLight,
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
  background: tokens.card,
  border: `1px solid ${tokens.borderSubtle}`,
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
  color: tokens.textMuted,
  letterSpacing: "0.12em",
  textTransform: "uppercase",
  marginBottom: 6,
};

const bigClockStyle: React.CSSProperties = {
  fontSize: "clamp(72px, 13vw, 200px)",
  fontWeight: 700,
  fontVariantNumeric: "tabular-nums",
  letterSpacing: "0.01em",
  color: tokens.textPrimary,
  lineHeight: 1,
};

const pausedBadgeStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  color: tokens.amber,
  letterSpacing: "0.08em",
  marginTop: 4,
};

const setIndexStyle: React.CSSProperties = {
  fontSize: 13,
  color: tokens.textSecondary,
  marginTop: 4,
};

const exClockCurrentStyle: React.CSSProperties = {
  fontSize: "clamp(56px, 9vw, 160px)",
  fontWeight: 700,
  fontVariantNumeric: "tabular-nums",
  color: tokens.textPrimary,
  letterSpacing: "0.01em",
  lineHeight: 1,
};

const exClockTargetStyle: React.CSSProperties = {
  fontSize: "clamp(18px, 2.8vw, 36px)",
  fontWeight: 400,
  fontVariantNumeric: "tabular-nums",
  color: tokens.textMuted,
  letterSpacing: "0.01em",
  lineHeight: 1,
};

const exNameStyle: React.CSSProperties = {
  fontSize: 14,
  color: tokens.textFaint,
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
  color: tokens.textSecondary,
  minWidth: 24,
  textAlign: "right",
  flexShrink: 0,
};

const queueNameStyle: React.CSSProperties = {
  flex: 1,
  fontSize: 17,
  color: tokens.textPrimary,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const queueDurStyle: React.CSSProperties = {
  fontSize: 16,
  color: tokens.textMuted,
  fontVariantNumeric: "tabular-nums",
  flexShrink: 0,
};

// ── Bottom bar ────────────────────────────────────────────────────────────────

const bottomBarStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "stretch",
  flexShrink: 0,
  borderTop: `1px solid ${tokens.divider}`,
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
  borderLeft: `1px solid ${tokens.divider}`,
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
    border: `1px solid ${tokens.borderMedium}`,
    background: disabled ? tokens.surfaceDisabled : tokens.surfaceActive,
    color: disabled ? tokens.textDisabled : tokens.textLight,
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
  border: `1px solid ${tokens.borderStrong}`,
  background: tokens.cardSubtle,
  color: tokens.textPrimary,
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
    color: disabled ? tokens.textDisabled : tokens.textFaint,
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

const startSetBtnStyle: React.CSSProperties = {
  flex: 2,
  height: 44,
  padding: 0,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  borderRadius: 10,
  border: "none",
  background: tokens.green,
  color: "#fff",
  cursor: "pointer",
  fontSize: 15,
  fontWeight: 700,
};

// ── Draft styles ──────────────────────────────────────────────────────────────

const draftSetCardStyle: React.CSSProperties = {
  background: tokens.card,
  border: `1px solid ${tokens.borderSubtle}`,
  borderRadius: 10,
  padding: "12px 16px",
  marginBottom: 10,
};

const draftSecBtnStyle: React.CSSProperties = {
  padding: "10px 20px",
  borderRadius: 8,
  border: `1px solid ${tokens.borderStrong}`,
  background: tokens.surfaceActive,
  color: tokens.textPrimary,
  cursor: "pointer",
  fontSize: 14,
};

const draftStartBtnStyle: React.CSSProperties = {
  padding: "10px 24px",
  borderRadius: 8,
  border: "none",
  background: tokens.green,
  color: "#fff",
  cursor: "pointer",
  fontWeight: 700,
  fontSize: 15,
};

// ── Shared ────────────────────────────────────────────────────────────────────

const errorStyle: React.CSSProperties = {
  color: tokens.red,
  fontSize: 13,
  marginTop: 8,
};
