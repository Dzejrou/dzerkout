import { invoke } from "@tauri-apps/api/core";
import type { ClearResult, ImportResult, ResetResult } from "../types/library";

export type ExportScope = "full" | "exercises" | "sets" | "workouts";

export const libraryApi = {
  exportJson: (scope: ExportScope = "full") =>
    invoke<string>("export_library_json", { scope }),

  importJson: (json: string) =>
    invoke<ImportResult>("import_library_json", { json }),

  resetLocalData: () =>
    invoke<ResetResult>("reset_local_data"),

  clearLocalData: () =>
    invoke<ClearResult>("clear_local_data"),
};
