import { invoke } from "@tauri-apps/api/core";
import type {
  WorkoutTemplate,
  WorkoutTemplateSummary,
  WorkoutTemplateDetail,
  WorkoutTemplateSetRef,
  WorkoutTemplateCardAssignment,
} from "../types/workoutTemplate";
import type { SetTemplate } from "../types/setTemplate";

export const workoutTemplatesApi = {
  list: () => invoke<WorkoutTemplateSummary[]>("list_workout_templates"),

  get: (id: string) =>
    invoke<WorkoutTemplateDetail>("get_workout_template", { id }),

  create: (params: {
    name: string;
    notes: string | null;
    defaultDurationSec: number;
    restSec: number | null;
  }) =>
    invoke<WorkoutTemplate>("create_workout_template", {
      name: params.name,
      notes: params.notes,
      defaultDurationSec: params.defaultDurationSec,
      restSec: params.restSec,
    }),

  update: (params: {
    id: string;
    name: string;
    notes: string | null;
    defaultDurationSec: number;
    restSec: number | null;
  }) =>
    invoke<WorkoutTemplate>("update_workout_template", {
      id: params.id,
      name: params.name,
      notes: params.notes,
      defaultDurationSec: params.defaultDurationSec,
      restSec: params.restSec,
    }),

  delete: (id: string) => invoke<void>("delete_workout_template", { id }),

  addSetRef: (workoutId: string, setId: string) =>
    invoke<WorkoutTemplateSetRef>("add_set_ref", { workoutId, setId }),

  removeSetRef: (setRefId: string) =>
    invoke<void>("remove_set_ref", { setRefId }),

  reorderSetRefs: (workoutId: string, orderedIds: string[]) =>
    invoke<void>("reorder_set_refs", { workoutId, orderedIds }),

  cloneSetFromWorkout: (setRefId: string) =>
    invoke<WorkoutTemplateSetRef>("clone_set_from_workout", { setRefId }),

  upsertCardAssignment: (params: {
    setRefId: string;
    cardId: string;
    exerciseId: string | null;
    displayLabel: string | null;
    durationHintSec: number | null;
    notes: string | null;
  }) =>
    invoke<WorkoutTemplateCardAssignment>("upsert_card_assignment", {
      setRefId: params.setRefId,
      cardId: params.cardId,
      exerciseId: params.exerciseId,
      displayLabel: params.displayLabel,
      durationHintSec: params.durationHintSec,
      notes: params.notes,
    }),

  deleteCardAssignment: (assignmentId: string) =>
    invoke<void>("delete_card_assignment", { assignmentId }),

  exportForkedSet: (setId: string, newName: string) =>
    invoke<SetTemplate>("export_forked_set", { setId, newName }),
};
