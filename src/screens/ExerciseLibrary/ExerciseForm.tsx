import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import type { Exercise } from "../../types/exercise";
import { EXERCISE_TAGS } from "../../types/exercise";
import { tokens } from "../../theme/tokens";

interface FormValues {
  name: string;
  notes: string;
}

interface Props {
  initial?: Exercise;
  onSave: (name: string, notes: string | null, tags: string[]) => void;
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

  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set());

  useEffect(() => {
    reset({ name: initial?.name ?? "", notes: initial?.notes ?? "" });
    setSelectedTags(new Set(initial?.tags ?? []));
  }, [initial, reset]);

  function toggleTag(tag: string) {
    setSelectedTags((prev) => {
      const next = new Set(prev);
      if (next.has(tag)) {
        next.delete(tag);
      } else {
        next.add(tag);
      }
      return next;
    });
  }

  function onSubmit(values: FormValues) {
    const tags = Array.from(selectedTags);
    const normalizedTags =
      tags.length > 1 && tags.includes("unspecified")
        ? tags.filter((tag) => tag !== "unspecified")
        : tags;
    onSave(values.name.trim(), values.notes.trim() || null, normalizedTags);
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
      <div>
        <label style={labelStyle}>Tags</label>
        <div style={tagGridStyle}>
          {EXERCISE_TAGS.map((tag) => {
            const active = selectedTags.has(tag);
            return (
              <button
                key={tag}
                type="button"
                onClick={() => toggleTag(tag)}
                style={{
                  padding: "4px 10px",
                  borderRadius: 6,
                  fontSize: 12,
                  fontWeight: active ? 600 : 400,
                  border: `1px solid ${active ? tokens.green : tokens.border}`,
                  background: active ? tokens.green : tokens.cardSubtle,
                  color: active ? tokens.greenText : tokens.textSecondary,
                  cursor: "pointer",
                  transition: "background 0.1s, border-color 0.1s, color 0.1s",
                }}
              >
                {tag}
              </button>
            );
          })}
        </div>
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
  color: tokens.textMuted,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  padding: "8px 10px",
  border: `1px solid ${tokens.borderMedium}`,
  borderRadius: 8,
  fontSize: 14,
  background: tokens.bg,
  color: tokens.textPrimary,
  outline: "none",
};

const errorStyle: React.CSSProperties = {
  color: tokens.red,
  fontSize: 12,
  marginTop: 4,
};

const tagGridStyle: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 6,
  marginTop: 2,
};

const cancelBtnStyle: React.CSSProperties = {
  padding: "8px 16px",
  borderRadius: 8,
  border: `1px solid ${tokens.borderMedium}`,
  background: "transparent",
  color: tokens.textMuted,
  cursor: "pointer",
  fontSize: 14,
};

const saveBtnStyle: React.CSSProperties = {
  padding: "8px 16px",
  borderRadius: 8,
  border: "none",
  background: tokens.green,
  color: "#fff",
  cursor: "pointer",
  fontSize: 14,
  fontWeight: 600,
};
