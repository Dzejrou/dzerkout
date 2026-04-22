import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { useQuery } from "@tanstack/react-query";
import { exercisesApi } from "../../api/exercises";
import type { SetTemplateCard } from "../../types/setTemplate";
import type { WorkoutTemplateCardAssignment } from "../../types/workoutTemplate";

interface FormValues {
  exercise_id: string;
  display_label: string;
  duration_hint_sec: string;
  notes: string;
}

interface Props {
  card: SetTemplateCard;
  assignment: WorkoutTemplateCardAssignment | undefined;
  onSave: (params: {
    exerciseId: string | null;
    displayLabel: string | null;
    durationHintSec: number | null;
    notes: string | null;
  }) => void;
  onDelete?: () => void;
  onCancel: () => void;
  saving?: boolean;
}

export default function AssignmentEditor({ card, assignment, onSave, onDelete, onCancel, saving }: Props) {
  const { data: exercises = [] } = useQuery({
    queryKey: ["exercises"],
    queryFn: exercisesApi.list,
  });

  const { register, handleSubmit, reset } = useForm<FormValues>({
    defaultValues: { exercise_id: "", display_label: "", duration_hint_sec: "", notes: "" },
  });

  useEffect(() => {
    reset({
      exercise_id: assignment?.exercise_id ?? card.exercise_id ?? "",
      display_label: assignment?.display_label ?? "",
      duration_hint_sec: assignment?.duration_hint_sec != null
        ? String(assignment.duration_hint_sec)
        : card.duration_hint_sec != null ? String(card.duration_hint_sec) : "",
      notes: assignment?.notes ?? card.notes ?? "",
    });
  }, [assignment, card, reset]);

  function onSubmit(values: FormValues) {
    onSave({
      exerciseId: values.exercise_id || null,
      displayLabel: values.display_label.trim() || null,
      durationHintSec: values.duration_hint_sec ? parseInt(values.duration_hint_sec, 10) : null,
      notes: values.notes.trim() || null,
    });
  }

  const isPlaceholder = card.card_type === "placeholder";

  return (
    <form onSubmit={handleSubmit(onSubmit)} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <p style={{ margin: 0, fontSize: 13, color: "#6b7280" }}>
        {isPlaceholder
          ? `Assign an exercise to this placeholder (${card.placeholder_label ?? card.placeholder_tag})`
          : "Override exercise or settings for this workout"}
      </p>

      <div>
        <label style={labelStyle}>Exercise</label>
        <select {...register("exercise_id")} style={inputStyle}>
          <option value="">— use card default —</option>
          {exercises.map((ex) => (
            <option key={ex.id} value={ex.id}>{ex.name}</option>
          ))}
        </select>
      </div>

      <div>
        <label style={labelStyle}>Display label override (optional)</label>
        <input {...register("display_label")} style={inputStyle} placeholder="Shown in runner" />
      </div>

      <div>
        <label style={labelStyle}>Duration override (sec, optional)</label>
        <input type="number" min={0} {...register("duration_hint_sec")} style={inputStyle} />
      </div>

      <div>
        <label style={labelStyle}>Notes override (optional)</label>
        <textarea
          {...register("notes")}
          style={{ ...inputStyle, height: 56, resize: "vertical" }}
        />
      </div>

      <div style={{ display: "flex", gap: 8, justifyContent: "space-between" }}>
        <div>
          {assignment && onDelete && (
            <button type="button" onClick={onDelete} style={deleteBtnStyle} disabled={saving}>
              Clear override
            </button>
          )}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" onClick={onCancel} style={cancelBtnStyle} disabled={saving}>Cancel</button>
          <button type="submit" style={saveBtnStyle} disabled={saving}>
            {saving ? "Saving…" : "Save override"}
          </button>
        </div>
      </div>
    </form>
  );
}

const labelStyle: React.CSSProperties = { display: "block", fontSize: 13, fontWeight: 500, marginBottom: 4 };
const inputStyle: React.CSSProperties = {
  width: "100%", boxSizing: "border-box", padding: "7px 10px",
  border: "1px solid #d1d5db", borderRadius: 6, fontSize: 14,
};
const cancelBtnStyle: React.CSSProperties = {
  padding: "7px 14px", borderRadius: 6, border: "1px solid #d1d5db",
  background: "#f9fafb", cursor: "pointer", fontSize: 14,
};
const saveBtnStyle: React.CSSProperties = {
  padding: "7px 14px", borderRadius: 6, border: "none",
  background: "#2563eb", color: "#fff", cursor: "pointer", fontSize: 14, fontWeight: 600,
};
const deleteBtnStyle: React.CSSProperties = {
  padding: "7px 14px", borderRadius: 6, border: "1px solid #fca5a5",
  background: "#fff5f5", color: "#dc2626", cursor: "pointer", fontSize: 14,
};
