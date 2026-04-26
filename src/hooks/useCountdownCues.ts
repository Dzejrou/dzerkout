import { useRef, useEffect } from "react";
import { CUE_SECONDS, FINAL_CUE_SECOND, playBeep } from "../audio/cues";

/**
 * Fires Web Audio countdown cues whenever the remaining time for a timed phase
 * crosses a cue-second boundary.
 *
 * Guarantees:
 * - Each cue second fires **at most once** per phase (no duplicates across re-renders).
 * - On mount / phase change, cue seconds that have **already elapsed** are
 *   pre-seeded as fired, so opening the app mid-countdown never replays old cues.
 * - If the timer is already at or past zero when a phase starts, the final tone
 *   is NOT played (it would be stale / confusing).
 * - No cues fire while `paused` is true or `enabled` is false.
 *
 * @param remainingSec  Seconds remaining in the current timed phase.
 *                      May be fractional or negative (overdue).
 * @param phaseId       Unique opaque ID for the current timed phase.
 *                      Pass `null` to fully suppress cues (e.g. untimed exercise,
 *                      draft/no-session state).
 * @param enabled       Master on/off switch — wire to the soundCues setting.
 * @param paused        When true, cues are suppressed (session is paused).
 */
export function useCountdownCues(
  remainingSec: number,
  phaseId: string | null,
  enabled: boolean,
  paused: boolean,
): void {
  // Tracks which cue-second values have already been played for the current phase.
  const firedRef = useRef<Set<number>>(new Set());

  // When the phase identity changes: reset the tracking set, pre-seeding any
  // cue seconds that are already in the past so they won't be replayed.
  // We intentionally exclude `remainingSec` from the dep array — we only want to
  // snapshot the initial remaining time at the moment the phase starts.
  useEffect(() => {
    // A cue second is "already elapsed" when remainingSec has dropped below it.
    const alreadyElapsed = new Set<number>(
      (CUE_SECONDS as readonly number[]).filter((sec) => sec > remainingSec),
    );
    firedRef.current = alreadyElapsed;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phaseId]);

  // Fire cues on every render (the ~250 ms timer interval drives re-renders).
  // No dependency array is intentional: we need to evaluate on every render
  // because remainingSec changes continuously and we cannot predict when it
  // will cross a cue boundary between renders.
  useEffect(() => {
    if (!enabled) return;
    if (!phaseId) return;
    if (paused) return;

    const floored = Math.floor(remainingSec);

    if (
      (CUE_SECONDS as readonly number[]).includes(floored) &&
      !firedRef.current.has(floored)
    ) {
      firedRef.current.add(floored);
      playBeep(floored === FINAL_CUE_SECOND);
    }
  }); // no deps — intentional; see comment above
}
