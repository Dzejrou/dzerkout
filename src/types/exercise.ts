export interface Exercise {
  id: string;
  name: string;
  notes: string | null;
  image_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface ExerciseCardRef {
  card_id: string;
  set_name: string;
}

export interface ExerciseReferences {
  cards: ExerciseCardRef[];
}
