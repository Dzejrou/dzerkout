import { invoke } from "@tauri-apps/api/core";
import type { StatsPayload, StatsRange } from "../types/stats";

export const statsApi = {
  getStats: (range: StatsRange = "all") =>
    invoke<StatsPayload>("get_stats", { range }),
};
