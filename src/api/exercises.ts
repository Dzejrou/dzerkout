import { invoke } from "@tauri-apps/api/core";
import type { Exercise, ExerciseReferences } from "../types/exercise";

export const exercisesApi = {
  list: () => invoke<Exercise[]>("list_exercises"),

  create: (name: string, notes: string | null) =>
    invoke<Exercise>("create_exercise", { name, notes }),

  update: (id: string, name: string, notes: string | null) =>
    invoke<Exercise>("update_exercise", { id, name, notes }),

  getReferences: (id: string) =>
    invoke<ExerciseReferences>("get_exercise_references", { id }),

  delete: (id: string, confirmed: boolean) =>
    invoke<void>("delete_exercise", { id, confirmed }),
};
