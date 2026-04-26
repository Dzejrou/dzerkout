import { invoke } from "@tauri-apps/api/core";
import type { Exercise, ExerciseReferences } from "../types/exercise";

export const exercisesApi = {
  list: () => invoke<Exercise[]>("list_exercises"),

  create: (name: string, notes: string | null, tags: string[] = []) =>
    invoke<Exercise>("create_exercise", { name, notes, tags }),

  update: (id: string, name: string, notes: string | null, tags: string[] = []) =>
    invoke<Exercise>("update_exercise", { id, name, notes, tags }),

  getReferences: (id: string) =>
    invoke<ExerciseReferences>("get_exercise_references", { id }),

  delete: (id: string, confirmed: boolean) =>
    invoke<void>("delete_exercise", { id, confirmed }),
};
