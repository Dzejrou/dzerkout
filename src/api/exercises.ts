import { invoke } from "@tauri-apps/api/core";
import type { Exercise, ExerciseMeta, ExerciseMuscleInput, ExerciseReferences } from "../types/exercise";

export const exercisesApi = {
  list: () => invoke<Exercise[]>("list_exercises"),

  create: (
    name: string,
    notes: string | null,
    tags: string[] = [],
    meta?: ExerciseMeta,
    muscles?: ExerciseMuscleInput[],
  ) =>
    invoke<Exercise>("create_exercise", {
      name,
      notes,
      tags,
      meta: meta ?? null,
      muscles: muscles ?? null,
    }),

  update: (
    id: string,
    name: string,
    notes: string | null,
    tags: string[] = [],
    muscles?: ExerciseMuscleInput[],
  ) =>
    invoke<Exercise>("update_exercise", {
      id,
      name,
      notes,
      tags,
      muscles: muscles ?? null,
    }),

  getReferences: (id: string) =>
    invoke<ExerciseReferences>("get_exercise_references", { id }),

  delete: (id: string, confirmed: boolean) =>
    invoke<void>("delete_exercise", { id, confirmed }),
};
