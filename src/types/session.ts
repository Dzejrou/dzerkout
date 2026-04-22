export type SessionStatus = "draft" | "in_progress" | "completed" | "abandoned";
export type ExerciseStatus = "pending" | "active" | "completed" | "skipped";

export interface WorkoutSessionRow {
  id: string;
  workout_template_id: string | null;
  source_workout_template_name: string | null;
  status: SessionStatus;
  session_date: string | null;
  started_at: string | null;
  ended_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface WorkoutSessionSetRow {
  id: string;
  workout_session_id: string;
  source_set_template_id: string | null;
  order_index: number;
  started_at: string | null;
  ended_at: string | null;
  paused_total_sec: number;
  paused_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface WorkoutSessionExerciseRow {
  id: string;
  workout_session_set_id: string;
  order_index: number;
  exercise_id: string | null;
  placeholder_tag: string | null;
  display_name: string;
  duration_hint_sec: number | null;
  status: ExerciseStatus;
  skipped: number;
  started_at: string | null;
  ended_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface TimerBase {
  set_started_at_ms: number | null;
  paused_total_sec: number;
  paused_at_ms: number | null;
}

export interface ActiveSessionPayload {
  session: WorkoutSessionRow;
  sets: WorkoutSessionSetRow[];
  exercises: WorkoutSessionExerciseRow[];
  current_exercise_id: string | null;
  current_set_id: string | null;
  timer_base: TimerBase;
}
