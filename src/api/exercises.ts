import { invoke } from "@tauri-apps/api/core";
import type { Exercise, ExerciseMeta, ExerciseMuscleInput, ExerciseReferences, ExerciseSearchFilters, ExerciseSearchResult } from "../types/exercise";

export const exercisesApi = {
  list: () => invoke<Exercise[]>("list_exercises"),

  get: (id: string) =>
    invoke<Exercise>("get_exercise", { id }),

  search: (filters: ExerciseSearchFilters) =>
    invoke<ExerciseSearchResult>("search_exercises", { filters }),

  create: (
    name: string,
    notes: string | null,
    tags: string[] = [],
    meta?: ExerciseMeta,
    muscles?: ExerciseMuscleInput[],
    poseTypes?: string[],
  ) =>
    invoke<Exercise>("create_exercise", {
      name,
      notes,
      tags,
      meta: meta ?? null,
      muscles: muscles ?? null,
      poseTypes: poseTypes ?? null,
    }),

  update: (
    id: string,
    name: string,
    notes: string | null,
    tags: string[] = [],
    meta?: ExerciseMeta,
    muscles?: ExerciseMuscleInput[],
    poseTypes?: string[],
  ) =>
    invoke<Exercise>("update_exercise", {
      id,
      name,
      notes,
      tags,
      muscles: muscles ?? null,
      meta: meta ?? null,
      poseTypes: poseTypes ?? null,
    }),

  getReferences: (id: string) =>
    invoke<ExerciseReferences>("get_exercise_references", { id }),

  delete: (id: string, confirmed: boolean) =>
    invoke<void>("delete_exercise", { id, confirmed }),
};
