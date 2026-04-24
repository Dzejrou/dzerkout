import { useState, useEffect } from "react";
import { useSessionStore } from "../store/sessionStore";

export function useElapsedMs(): number {
  const { setStartedAt, pausedTotalSec, pausedAt, sessionStatus } =
    useSessionStore();
  const [now, setNow] = useState(Date.now);

  useEffect(() => {
    if (!setStartedAt || pausedAt !== null || sessionStatus !== "in_progress")
      return;
    const id = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(id);
  }, [setStartedAt, pausedAt, sessionStatus]);

  if (!setStartedAt) return 0;
  const wall = pausedAt !== null ? pausedAt : now;
  return Math.max(0, wall - setStartedAt - pausedTotalSec * 1000);
}

export function useExerciseElapsedMs(): {
  elapsedMs: number;
  durationHintSec: number | null;
} {
  const {
    currentExerciseId,
    exercises,
    pausedAt,
    pausedTotalSec,
    exercisePausedOffsetSec,
    sessionStatus,
  } = useSessionStore();
  const [now, setNow] = useState(Date.now);

  const currentExercise = exercises.find((e) => e.id === currentExerciseId) ?? null;
  const exerciseStartedAt = currentExercise?.started_at
    ? new Date(currentExercise.started_at).getTime()
    : null;

  useEffect(() => {
    if (!exerciseStartedAt || pausedAt !== null || sessionStatus !== "in_progress")
      return;
    const id = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(id);
  }, [exerciseStartedAt, pausedAt, sessionStatus]);

  if (!exerciseStartedAt) return { elapsedMs: 0, durationHintSec: null };
  const wall = pausedAt !== null ? pausedAt : now;
  const pausedDuringExerciseMs = (pausedTotalSec - exercisePausedOffsetSec) * 1000;
  return {
    elapsedMs: Math.max(0, wall - exerciseStartedAt - pausedDuringExerciseMs),
    durationHintSec: currentExercise?.duration_hint_sec ?? null,
  };
}
