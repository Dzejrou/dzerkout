export interface Exercise {
  id: string;
  name: string;
  notes: string | null;
  image_url: string | null;
  /** JSON-encoded array of image URL strings, e.g.
   *  `'["catalog/foo/0.jpg","catalog/foo/1.jpg"]'`. Null when no
   *  multi-image set is stored; UI falls back to `image_url` in that case. */
  image_urls_json: string | null;
  tags: string[];
  catalog_source: string | null;
  catalog_id: string | null;
  is_catalog: boolean;
  category: string | null;
  equipment: string | null;
  level: string | null;
  mechanic: string | null;
  force: string | null;
  instructions_json: string | null;
  sanskrit_name: string | null;
  primary_muscles: string[];
  secondary_muscles: string[];
  pose_types: string[];
  created_at: string;
  updated_at: string;
}

/** All valid exercise tag values (mirrors VALID_EXERCISE_TAGS in Rust). */
export const EXERCISE_TAGS = [
  "unspecified",
  "push",
  "pull",
  "legs",
  "core",
  "mobility",
  "yoga",
  "cardio",
  "isotonic",
  "isometric",
  "concentric",
  "eccentric",
] as const;

export type ExerciseTag = (typeof EXERCISE_TAGS)[number];

/** Valid catalog metadata enum values (mirrors Rust constants). */
export const EXERCISE_CATEGORIES = [
  "strength",
  "stretching",
  "cardio",
  "plyometrics",
  "powerlifting",
  "olympic weightlifting",
  "strongman",
  "yoga",
] as const;

export const EXERCISE_EQUIPMENT = [
  "none",
  "body only",
  "barbell",
  "dumbbell",
  "cable",
  "machine",
  "kettlebells",
  "bands",
  "medicine ball",
  "exercise ball",
  "foam roll",
  "e-z curl bar",
  "other",
] as const;

export const EXERCISE_POSE_TYPES = [
  "standing",
  "forward_bend",
  "seated",
  "arm_leg_support",
  "back_bend",
  "balancing",
  "arm_balance",
  "supine",
  "prone",
  "inversion",
  "twist",
  "lateral_bend",
] as const;

export type ExercisePoseType = (typeof EXERCISE_POSE_TYPES)[number];

export const EXERCISE_LEVELS = ["beginner", "intermediate", "expert"] as const;
export const EXERCISE_MECHANICS = ["compound", "isolation"] as const;
export const EXERCISE_FORCES = ["push", "pull", "static"] as const;

export const EXERCISE_MUSCLES = [
  "abdominals",
  "abductors",
  "adductors",
  "biceps",
  "calves",
  "chest",
  "forearms",
  "glutes",
  "hamstrings",
  "lats",
  "lower back",
  "middle back",
  "neck",
  "quadriceps",
  "shoulders",
  "traps",
  "triceps",
] as const;

export type ExerciseCategory = (typeof EXERCISE_CATEGORIES)[number];
export type ExerciseEquipment = (typeof EXERCISE_EQUIPMENT)[number];
export type ExerciseLevel = (typeof EXERCISE_LEVELS)[number];
export type ExerciseMechanic = (typeof EXERCISE_MECHANICS)[number];
export type ExerciseForce = (typeof EXERCISE_FORCES)[number];
export type ExerciseMuscle = (typeof EXERCISE_MUSCLES)[number];
export type MuscleRole = "primary" | "secondary";

/** Optional catalog metadata passed on create (not used by user-created exercises). */
export interface ExerciseMeta {
  catalog_source?: string | null;
  catalog_id?: string | null;
  is_catalog?: boolean;
  category?: ExerciseCategory | null;
  equipment?: ExerciseEquipment | null;
  level?: ExerciseLevel | null;
  mechanic?: ExerciseMechanic | null;
  force?: ExerciseForce | null;
  instructions_json?: string | null;
  sanskrit_name?: string | null;
}

export interface ExerciseMuscleInput {
  muscle: ExerciseMuscle;
  role: MuscleRole;
}

export interface ExerciseSearchFilters {
  query?: string;
  source?: "all" | "user" | "catalog";
  catalog_source?: string;
  category?: string;
  equipment?: string;
  level?: string;
  primary_muscle?: string;
  force?: string;
  tag?: string;
  pose_type?: string;
  limit?: number;
  offset?: number;
}

export interface CatalogSourceSummary {
  source: string;
  count: number;
}

export interface ExerciseSearchResult {
  exercises: Exercise[];
  total: number;
}

export interface ExerciseCardRef {
  card_id: string;
  set_name: string;
}

export interface ExerciseReferences {
  cards: ExerciseCardRef[];
}
