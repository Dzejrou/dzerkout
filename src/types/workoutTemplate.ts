export interface WorkoutTemplate {
  id: string;
  name: string;
  notes: string | null;
  default_exercise_duration_sec: number;
  rest_between_sets_sec: number | null;
  created_at: string;
  updated_at: string;
}

export interface WorkoutTemplateSummary extends WorkoutTemplate {
  set_count: number;
}

export interface WorkoutTemplateSetRef {
  id: string;
  workout_template_id: string;
  set_template_id: string;
  order_index: number;
  set_name: string;
  created_at: string;
  updated_at: string;
}

export interface WorkoutTemplateCardAssignment {
  id: string;
  workout_template_set_ref_id: string;
  set_template_card_id: string;
  exercise_id: string | null;
  display_label: string | null;
  duration_hint_sec: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface WorkoutTemplateDetail extends WorkoutTemplate {
  set_refs: WorkoutTemplateSetRef[];
  assignments: WorkoutTemplateCardAssignment[];
}
