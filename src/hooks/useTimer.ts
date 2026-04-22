import { useState, useEffect } from "react";
import { useSessionStore } from "../store/sessionStore";

export function useElapsedMs(): number {
  const { setStartedAt, pausedTotalSec, pausedAt, sessionStatus } =
    useSessionStore();
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!setStartedAt || pausedAt !== null || sessionStatus !== "in_progress")
      return;
    const id = setInterval(() => setTick((t) => t + 1), 100);
    return () => clearInterval(id);
  }, [setStartedAt, pausedAt, sessionStatus]);

  // tick is used only to trigger re-renders; value derives from DB base values
  void tick;

  if (!setStartedAt) return 0;
  const wall = pausedAt !== null ? pausedAt : Date.now();
  return Math.max(0, wall - setStartedAt - pausedTotalSec * 1000);
}
