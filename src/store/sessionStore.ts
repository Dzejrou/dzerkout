import { create } from "zustand";
import type {
  ActiveSessionPayload,
  WorkoutSessionSetRow,
  WorkoutSessionExerciseRow,
  SessionStatus,
  RestPhaseInfo,
} from "../types/session";

interface SessionStore {
  sessionId: string | null;
  sessionStatus: SessionStatus | null;
  sets: WorkoutSessionSetRow[];
  exercises: WorkoutSessionExerciseRow[];
  currentSetId: string | null;
  currentExerciseId: string | null;
  // Timer base values sourced from the current WorkoutSessionSet
  setStartedAt: number | null;   // Unix ms
  pausedTotalSec: number;
  pausedAt: number | null;       // Unix ms; non-null = currently paused
  // Snapshot of paused_total_sec at the moment the current exercise became active.
  // Per-exercise paused time = pausedTotalSec - exercisePausedOffsetSec.
  exercisePausedOffsetSec: number;
  // Non-null when the runner is in a between-set rest phase.
  restPhase: RestPhaseInfo | null;
  // Configured rest duration from the workout template. null = no rest / no template.
  restBetweenSetsSec: number | null;

  load: (payload: ActiveSessionPayload) => void;
  clear: () => void;
}


export const useSessionStore = create<SessionStore>((set) => ({
  sessionId: null,
  sessionStatus: null,
  sets: [],
  exercises: [],
  currentSetId: null,
  currentExerciseId: null,
  setStartedAt: null,
  pausedTotalSec: 0,
  pausedAt: null,
  exercisePausedOffsetSec: 0,
  restPhase: null,
  restBetweenSetsSec: null,

  load: (payload) => {
    const { session, sets, exercises, current_set_id, current_exercise_id, timer_base, rest_phase, rest_between_sets_sec } = payload;
    set((prev) => ({
      sessionId: session.id,
      sessionStatus: session.status,
      sets,
      exercises,
      currentSetId: current_set_id,
      currentExerciseId: current_exercise_id,
      setStartedAt: timer_base.set_started_at_ms,
      pausedTotalSec: timer_base.paused_total_sec,
      pausedAt: timer_base.paused_at_ms,
      // Per-exercise paused time = pausedTotalSec - exercisePausedOffsetSec.
      // Always derive from the exercise row's stored paused_offset_sec so that cold
      // recovery after app relaunch uses the historically correct baseline rather than
      // the current paused_total_sec (which would be too large if earlier pauses
      // accumulated before this exercise started, causing the timer to jump forward).
      exercisePausedOffsetSec:
        current_exercise_id !== prev.currentExerciseId
          ? (exercises.find((e) => e.id === current_exercise_id)?.paused_offset_sec
              ?? timer_base.paused_total_sec)
          : prev.exercisePausedOffsetSec,
      restPhase: rest_phase ?? null,
      restBetweenSetsSec: rest_between_sets_sec ?? null,
    }));
  },

  clear: () =>
    set({
      sessionId: null,
      sessionStatus: null,
      sets: [],
      exercises: [],
      currentSetId: null,
      currentExerciseId: null,
      setStartedAt: null,
      pausedTotalSec: 0,
      pausedAt: null,
      exercisePausedOffsetSec: 0,
      restPhase: null,
      restBetweenSetsSec: null,
    }),
}));
