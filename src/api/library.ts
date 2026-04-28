import { invoke } from "@tauri-apps/api/core";
import type { ImportResult } from "../types/library";

export type ExportScope = "full" | "exercises" | "sets" | "workouts";

export const libraryApi = {
  exportJson: (scope: ExportScope = "full") =>
    invoke<string>("export_library_json", { scope }),

  importJson: (json: string) =>
    invoke<ImportResult>("import_library_json", { json }),
};
