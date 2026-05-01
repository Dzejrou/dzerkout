import { save, open } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export async function saveJsonToFile(json: string): Promise<"saved" | "cancelled"> {
  const filePath = await save({
    defaultPath: `dzerkout-backup-${todayIso()}.json`,
    filters: [{ name: "JSON", extensions: ["json"] }],
  });
  if (filePath == null) return "cancelled";
  await invoke("write_text_to_uri", { path: filePath, content: json });
  return "saved";
}

/** Show the file picker and return the chosen file path/URI, or null if cancelled. */
export async function pickJsonFile(): Promise<string | null> {
  const result = await open({
    multiple: false,
    filters: [{ name: "JSON", extensions: ["json"] }],
  });
  if (result == null) return null;
  return Array.isArray(result) ? result[0] : result;
}

/** Read the content of a file at the given path or content:// URI. */
export async function readJsonFile(filePath: string): Promise<string> {
  return invoke<string>("read_text_from_uri", { path: filePath });
}
