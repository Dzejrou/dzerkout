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
  rest_duration_sec: number | null;
  rest_started_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface RestPhaseInfo {
  next_set_id: string;
  rest_duration_sec: number;
  rest_started_at_ms: number;
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
  paused_offset_sec: number;
  performed_duration_sec: number | null;
  created_at: string;
  updated_at: string;
}

export interface TimerBase {
  set_started_at_ms: number | null;
  paused_total_sec: number;
  paused_at_ms: number | null;
}

export interface SessionSummary {
  id: string;
  source_workout_template_name: string | null;
  status: SessionStatus;
  session_date: string | null;
  started_at: string | null;
  ended_at: string | null;
  notes: string | null;
  set_count: number;
  exercise_count: number;
  created_at: string;
  updated_at: string;
}

export interface SessionDetailSet {
  id: string;
  order_index: number;
  started_at: string | null;
  ended_at: string | null;
  paused_total_sec: number;
  exercises: WorkoutSessionExerciseRow[];
}

export interface SessionDetail {
  id: string;
  source_workout_template_name: string | null;
  status: SessionStatus;
  session_date: string | null;
  started_at: string | null;
  ended_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  sets: SessionDetailSet[];
}

export interface ActiveSessionPayload {
  session: WorkoutSessionRow;
  sets: WorkoutSessionSetRow[];
  exercises: WorkoutSessionExerciseRow[];
  current_exercise_id: string | null;
  current_set_id: string | null;
  timer_base: TimerBase;
  rest_phase: RestPhaseInfo | null;
}
