import { useEffect } from "react";
import { sessionsApi } from "../api/sessions";
import { useSessionStore } from "../store/sessionStore";

/**
 * On mount, silently checks for an unfinished session and loads it into the
 * session store if one exists. No modal is shown and no navigation occurs —
 * the Runner menu item will reflect the active state, and the user can open
 * Runner at their own discretion to resume, finish, or abandon the session.
 */
export function useSessionRecovery() {
  const load = useSessionStore((s) => s.load);

  useEffect(() => {
    sessionsApi.getActiveSession().then((payload) => {
      if (!payload) return;
      load(payload);
    }).catch(() => {
      // Recovery fetch failed silently — app is still usable
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
