import { invoke } from "@tauri-apps/api/core";
import type { SessionDetail, SessionSummary } from "../types/session";

export const historyApi = {
  list: () => invoke<SessionSummary[]>("list_session_history"),
  getDetail: (sessionId: string) =>
    invoke<SessionDetail>("get_session_detail", { sessionId }),
};
