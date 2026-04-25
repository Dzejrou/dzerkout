import { useEffect } from "react";
import { useForm } from "react-hook-form";
import type { Exercise } from "../../types/exercise";

interface FormValues {
  name: string;
  notes: string;
}

interface Props {
  initial?: Exercise;
  onSave: (name: string, notes: string | null) => void;
  onCancel: () => void;
  saving?: boolean;
}

export default function ExerciseForm({ initial, onSave, onCancel, saving }: Props) {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({ defaultValues: { name: "", notes: "" } });

  useEffect(() => {
    reset({ name: initial?.name ?? "", notes: initial?.notes ?? "" });
  }, [initial, reset]);

  function onSubmit(values: FormValues) {
    onSave(values.name.trim(), values.notes.trim() || null);
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div>
        <label style={labelStyle}>Name</label>
        <input
          {...register("name", { required: "Name is required" })}
          style={inputStyle}
          placeholder="e.g. Squat"
          autoFocus
        />
        {errors.name && <p style={errorStyle}>{errors.name.message}</p>}
      </div>
      <div>
        <label style={labelStyle}>Notes (optional)</label>
        <textarea
          {...register("notes")}
          style={{ ...inputStyle, height: 72, resize: "vertical" }}
          placeholder="Cues, tempo, etc."
        />
      </div>
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button type="button" onClick={onCancel} style={cancelBtnStyle} disabled={saving}>
          Cancel
        </button>
        <button type="submit" style={saveBtnStyle} disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </form>
  );
}

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 13,
  fontWeight: 500,
  marginBottom: 4,
  color: "#8e8e93",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  padding: "8px 10px",
  border: "1px solid rgba(255,255,255,0.12)",
  borderRadius: 8,
  fontSize: 14,
  background: "#1c1c1e",
  color: "#f2f2f7",
  outline: "none",
};

const errorStyle: React.CSSProperties = {
  color: "#f87171",
  fontSize: 12,
  marginTop: 4,
};

const cancelBtnStyle: React.CSSProperties = {
  padding: "8px 16px",
  borderRadius: 8,
  border: "1px solid rgba(255,255,255,0.12)",
  background: "transparent",
  color: "#8e8e93",
  cursor: "pointer",
  fontSize: 14,
};

const saveBtnStyle: React.CSSProperties = {
  padding: "8px 16px",
  borderRadius: 8,
  border: "none",
  background: "#2d6a3f",
  color: "#fff",
  cursor: "pointer",
  fontSize: 14,
  fontWeight: 600,
};
