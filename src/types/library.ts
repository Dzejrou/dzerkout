export interface ImportResult {
  exercises_created: number;
  exercises_updated: number;
  sets_created: number;
  sets_updated: number;
  workouts_created: number;
  workouts_updated: number;
  sessions_created: number;
  sessions_updated: number;
}

export interface ResetResult {
  cleared: boolean;
  seeded: boolean;
  import_result: ImportResult | null;
}

export interface ClearResult {
  cleared: boolean;
}
