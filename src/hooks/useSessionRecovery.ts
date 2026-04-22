import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { sessionsApi } from "../api/sessions";
import { useSessionStore } from "../store/sessionStore";
import { useUiStore } from "../store/uiStore";

export function useSessionRecovery() {
  const load = useSessionStore((s) => s.load);
  const showConfirmModal = useUiStore((s) => s.showConfirmModal);
  const navigate = useNavigate();

  useEffect(() => {
    sessionsApi.getActiveSession().then((payload) => {
      if (!payload) return;
      const isDraft = payload.session.status === "draft";
      showConfirmModal({
        message: isDraft
          ? "You have an unstarted workout. Continue?"
          : "You have a workout in progress. Resume?",
        confirmLabel: isDraft ? "Continue" : "Resume",
        onConfirm: () => {
          load(payload);
          navigate("/runner");
        },
        onCancel: () => sessionsApi.discard(payload.session.id),
      });
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
