export interface Exercise {
  id: string;
  name: string;
  notes: string | null;
  image_url: string | null;
  tags: string[];
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

export interface ExerciseCardRef {
  card_id: string;
  set_name: string;
}

export interface ExerciseReferences {
  cards: ExerciseCardRef[];
}
