export type StatsRange = "all" | "30d" | "7d";

export interface StatsSummary {
  completed_workouts: number;
  total_workout_duration_sec: number;
  total_exercise_duration_sec: number;
  total_sets: number;
  total_exercises: number;
  skipped_exercises: number;
  last_completed_at: string | null;
}

export interface TagStat {
  tag: string;
  exercise_count: number;
  duration_sec: number;
}

export interface ExerciseStat {
  exercise_key: string;
  display_name: string;
  exercise_count: number;
  duration_sec: number;
  skipped_count: number;
  last_performed_at: string | null;
}

export interface StatsPayload {
  range: string;
  summary: StatsSummary;
  tags: TagStat[];
  exercises: ExerciseStat[];
}
