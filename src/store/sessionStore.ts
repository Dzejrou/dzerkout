import { create } from "zustand";
import type {
  ActiveSessionPayload,
  WorkoutSessionSetRow,
  WorkoutSessionExerciseRow,
  SessionStatus,
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

  load: (payload) => {
    const { session, sets, exercises, current_set_id, current_exercise_id, timer_base } = payload;
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
      // When the active exercise changes, snapshot paused_total_sec as the new
      // per-exercise offset. Per-exercise paused time = pausedTotalSec - exercisePausedOffsetSec.
      exercisePausedOffsetSec:
        current_exercise_id !== prev.currentExerciseId
          ? timer_base.paused_total_sec
          : prev.exercisePausedOffsetSec,
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
    }),
}));
