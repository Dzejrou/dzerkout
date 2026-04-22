import { invoke } from "@tauri-apps/api/core";
import type {
  SetTemplate,
  SetTemplateSummary,
  SetTemplateCard,
  SetTemplateDetail,
  CardType,
  PlaceholderTag,
} from "../types/setTemplate";

export const setTemplatesApi = {
  list: () => invoke<SetTemplateSummary[]>("list_set_templates"),

  get: (id: string) => invoke<SetTemplateDetail>("get_set_template", { id }),

  create: (name: string, notes: string | null) =>
    invoke<SetTemplate>("create_set_template", { name, notes }),

  update: (id: string, name: string, notes: string | null) =>
    invoke<SetTemplate>("update_set_template", { id, name, notes }),

  delete: (id: string) => invoke<void>("delete_set_template", { id }),

  clone: (id: string) => invoke<SetTemplate>("clone_set_template", { id }),

  addCard: (params: {
    setId: string;
    cardType: CardType;
    exerciseId?: string | null;
    placeholderTag?: PlaceholderTag | null;
    placeholderLabel?: string | null;
    durationHintSec?: number | null;
    notes?: string | null;
  }) =>
    invoke<SetTemplateCard>("add_card", {
      setId: params.setId,
      cardType: params.cardType,
      exerciseId: params.exerciseId ?? null,
      placeholderTag: params.placeholderTag ?? null,
      placeholderLabel: params.placeholderLabel ?? null,
      durationHintSec: params.durationHintSec ?? null,
      notes: params.notes ?? null,
    }),

  updateCard: (params: {
    cardId: string;
    exerciseId?: string | null;
    placeholderTag?: PlaceholderTag | null;
    placeholderLabel?: string | null;
    durationHintSec?: number | null;
    notes?: string | null;
  }) =>
    invoke<SetTemplateCard>("update_card", {
      cardId: params.cardId,
      exerciseId: params.exerciseId ?? null,
      placeholderTag: params.placeholderTag ?? null,
      placeholderLabel: params.placeholderLabel ?? null,
      durationHintSec: params.durationHintSec ?? null,
      notes: params.notes ?? null,
    }),

  removeCard: (cardId: string) => invoke<void>("remove_card", { cardId }),

  reorderCards: (setId: string, orderedIds: string[]) =>
    invoke<void>("reorder_cards", { setId, orderedIds }),
};
