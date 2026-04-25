import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { useQuery } from "@tanstack/react-query";
import { exercisesApi } from "../../api/exercises";
import type { SetTemplateCard, CardType, PlaceholderTag } from "../../types/setTemplate";

const TAGS: PlaceholderTag[] = ["unspecified", "push", "pull", "legs", "core", "mobility"];

interface FormValues {
  card_type: CardType;
  exercise_id: string;
  placeholder_tag: PlaceholderTag;
  placeholder_label: string;
  duration_hint_sec: string;
  notes: string;
}

interface Props {
  card?: SetTemplateCard;
  onSave: (values: {
    cardType: CardType;
    exerciseId: string | null;
    placeholderTag: PlaceholderTag | null;
    placeholderLabel: string | null;
    durationHintSec: number | null;
    notes: string | null;
  }) => void;
  onCancel: () => void;
  saving?: boolean;
}

export default function CardEditor({ card, onSave, onCancel, saving }: Props) {
  const { data: exercises = [] } = useQuery({
    queryKey: ["exercises"],
    queryFn: exercisesApi.list,
  });

  const { register, handleSubmit, watch, reset } = useForm<FormValues>({
    defaultValues: {
      card_type: "concrete",
      exercise_id: "",
      placeholder_tag: "unspecified",
      placeholder_label: "",
      duration_hint_sec: "",
      notes: "",
    },
  });

  useEffect(() => {
    if (card) {
      reset({
        card_type: card.card_type,
        exercise_id: card.exercise_id ?? "",
        placeholder_tag: card.placeholder_tag ?? "unspecified",
        placeholder_label: card.placeholder_label ?? "",
        duration_hint_sec: card.duration_hint_sec != null ? String(card.duration_hint_sec) : "",
        notes: card.notes ?? "",
      });
    }
  }, [card, reset]);

  const cardType = watch("card_type");

  function onSubmit(values: FormValues) {
    const dur = values.duration_hint_sec ? parseInt(values.duration_hint_sec, 10) : null;
    if (values.card_type === "concrete") {
      onSave({
        cardType: "concrete",
        exerciseId: values.exercise_id || null,
        placeholderTag: null,
        placeholderLabel: null,
        durationHintSec: dur,
        notes: values.notes.trim() || null,
      });
    } else {
      onSave({
        cardType: "placeholder",
        exerciseId: null,
        placeholderTag: values.placeholder_tag || "unspecified",
        placeholderLabel: values.placeholder_label.trim() || null,
        durationHintSec: dur,
        notes: values.notes.trim() || null,
      });
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", gap: 8 }}>
        {(["concrete", "placeholder"] as CardType[]).map((t) => (
          <label
            key={t}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              cursor: card ? "default" : "pointer",
              opacity: card && card.card_type !== t ? 0.35 : 1,
            }}
          >
            <input type="radio" value={t} {...register("card_type")} disabled={!!card} />
            <span style={{ fontSize: 14, textTransform: "capitalize" }}>{t}</span>
          </label>
        ))}
      </div>
      {card && (
        <p style={{ margin: "0", fontSize: 12, color: "#4b5563" }}>
          Card type cannot be changed after creation.
        </p>
      )}

      {cardType === "concrete" ? (
        <div>
          <label style={labelStyle}>Exercise</label>
          <select {...register("exercise_id")} style={selectStyle}>
            <option value="">— none —</option>
            {exercises.map((ex) => (
              <option key={ex.id} value={ex.id}>{ex.name}</option>
            ))}
          </select>
        </div>
      ) : (
        <>
          <div>
            <label style={labelStyle}>Tag</label>
            <select {...register("placeholder_tag")} style={selectStyle}>
              {TAGS.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Label (optional)</label>
            <input {...register("placeholder_label")} style={inputStyle} placeholder="e.g. Upper push" />
          </div>
        </>
      )}

      <div>
        <label style={labelStyle}>Duration hint (sec, optional)</label>
        <input
          type="number"
          min={0}
          {...register("duration_hint_sec")}
          style={inputStyle}
          placeholder="e.g. 45"
        />
      </div>

      <div>
        <label style={labelStyle}>Notes (optional)</label>
        <textarea
          {...register("notes")}
          style={{ ...inputStyle, height: 56, resize: "vertical" }}
        />
      </div>

      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button type="button" onClick={onCancel} style={cancelBtnStyle} disabled={saving}>Cancel</button>
        <button type="submit" style={saveBtnStyle} disabled={saving}>
          {saving ? "Saving…" : card ? "Update" : "Add card"}
        </button>
      </div>
    </form>
  );
}

const labelStyle: React.CSSProperties = {
  display: "block", fontSize: 13, fontWeight: 500, marginBottom: 4,
  color: "#8e8e93",
};
const inputStyle: React.CSSProperties = {
  width: "100%", boxSizing: "border-box", padding: "8px 10px",
  border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8, fontSize: 14,
  background: "#1c1c1e", color: "#f2f2f7", outline: "none",
};
const selectStyle: React.CSSProperties = {
  ...inputStyle,
  appearance: "none",
  WebkitAppearance: "none",
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath fill='%238e8e93' d='M6 8L0 0h12z'/%3E%3C/svg%3E")`,
  backgroundRepeat: "no-repeat",
  backgroundPosition: "right 10px center",
  paddingRight: 30,
};
const cancelBtnStyle: React.CSSProperties = {
  padding: "8px 16px", borderRadius: 8,
  border: "1px solid rgba(255,255,255,0.12)",
  background: "transparent", color: "#8e8e93", cursor: "pointer", fontSize: 14,
};
const saveBtnStyle: React.CSSProperties = {
  padding: "8px 16px", borderRadius: 8, border: "none",
  background: "#2d6a3f", color: "#fff", cursor: "pointer", fontSize: 14, fontWeight: 600,
};
