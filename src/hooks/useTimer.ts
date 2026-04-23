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
