import { invoke } from "@tauri-apps/api/core";
import type { ActiveSessionPayload, WorkoutSessionRow } from "../types/session";

export const sessionsApi = {
  getActiveSession: () =>
    invoke<ActiveSessionPayload | null>("get_active_session"),

  createDraft: (workoutTemplateId: string) =>
    invoke<ActiveSessionPayload>("create_session_draft", {
      workoutTemplateId,
    }),

  start: (sessionId: string) =>
    invoke<ActiveSessionPayload>("start_session", { sessionId }),

  pause: (sessionId: string, setId: string) =>
    invoke<ActiveSessionPayload>("pause_session", { sessionId, setId }),

  resume: (sessionId: string, setId: string) =>
    invoke<ActiveSessionPayload>("resume_session", { sessionId, setId }),

  advance: (sessionId: string) =>
    invoke<ActiveSessionPayload>("advance_exercise", { sessionId }),

  retreat: (sessionId: string) =>
    invoke<ActiveSessionPayload>("retreat_exercise", { sessionId }),

  skip: (sessionId: string, exerciseId: string) =>
    invoke<ActiveSessionPayload>("skip_exercise", { sessionId, exerciseId }),

  finish: (sessionId: string) =>
    invoke<WorkoutSessionRow>("finish_session", { sessionId }),

  abandon: (sessionId: string) =>
    invoke<void>("abandon_session", { sessionId }),

  discard: (sessionId: string) =>
    invoke<void>("discard_session", { sessionId }),
};
