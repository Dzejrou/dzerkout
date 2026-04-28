import { invoke } from "@tauri-apps/api/core";
import type { ImportResult } from "../types/library";

export const libraryApi = {
  exportJson: () => invoke<string>("export_library_json"),

  importJson: (json: string) =>
    invoke<ImportResult>("import_library_json", { json }),
};
