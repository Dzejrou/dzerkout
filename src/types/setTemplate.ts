export type CardType = "concrete" | "placeholder";

export type PlaceholderTag =
  | "unspecified"
  | "push"
  | "pull"
  | "legs"
  | "core"
  | "mobility";

export interface SetTemplate {
  id: string;
  name: string;
  notes: string | null;
  owning_workout_template_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface SetTemplateSummary extends SetTemplate {
  card_count: number;
}

export interface SetTemplateCard {
  id: string;
  set_template_id: string;
  card_type: CardType;
  order_index: number;
  duration_hint_sec: number | null;
  notes: string | null;
  // concrete only
  exercise_id: string | null;
  // placeholder only
  placeholder_tag: PlaceholderTag | null;
  placeholder_label: string | null;
  created_at: string;
  updated_at: string;
}

export interface SetTemplateDetail extends SetTemplate {
  cards: SetTemplateCard[];
}
