import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { sessionsApi } from "../api/sessions";
import { useSessionStore } from "../store/sessionStore";
import { useUiStore } from "../store/uiStore";

export function useSessionRecovery() {
  const load = useSessionStore((s) => s.load);
  const clear = useSessionStore((s) => s.clear);
  const showConfirmModal = useUiStore((s) => s.showConfirmModal);
  const navigate = useNavigate();

  useEffect(() => {
    sessionsApi.getActiveSession().then((payload) => {
      if (!payload) return;
      const isDraft = payload.session.status === "draft";
      showConfirmModal({
        message: isDraft
          ? "You have an unstarted workout. Continue setting it up?"
          : "You have a workout in progress. Resume where you left off?",
        confirmLabel: isDraft ? "Continue" : "Resume",
        onConfirm: () => {
          load(payload);
          navigate("/runner");
        },
        onCancel: () => {
          if (isDraft) {
            sessionsApi.discard(payload.session.id).catch(() => {});
          } else {
            // Leave in_progress session intact — user can return later
            clear();
          }
        },
      });
    }).catch(() => {
      // Recovery fetch failed silently — app is still usable
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
