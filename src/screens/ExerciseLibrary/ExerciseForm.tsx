import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import type {
  Exercise,
  ExerciseMeta,
  ExerciseMuscle,
  ExerciseMuscleInput,
} from "../../types/exercise";
import {
  EXERCISE_TAGS,
  EXERCISE_CATEGORIES,
  EXERCISE_EQUIPMENT,
  EXERCISE_LEVELS,
  EXERCISE_MECHANICS,
  EXERCISE_FORCES,
  EXERCISE_MUSCLES,
  EXERCISE_POSE_TYPES,
} from "../../types/exercise";
import { tokens } from "../../theme/tokens";

interface FormValues {
  name: string;
  notes: string;
  category: string;
  equipment: string;
  level: string;
  mechanic: string;
  force: string;
  instructions: string;
}

interface Props {
  initial?: Exercise;
  onSave: (
    name: string,
    notes: string | null,
    tags: string[],
    meta: ExerciseMeta,
    muscles: ExerciseMuscleInput[],
    poseTypes: string[],
  ) => void;
  onCancel: () => void;
  saving?: boolean;
}

export default function ExerciseForm({ initial, onSave, onCancel, saving }: Props) {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    defaultValues: {
      name: "",
      notes: "",
      category: "",
      equipment: "",
      level: "",
      mechanic: "",
      force: "",
      instructions: "",
    },
  });

  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set());
  const [muscleRoles, setMuscleRoles] = useState<Map<string, "primary" | "secondary">>(new Map());
  const [selectedPoseTypes, setSelectedPoseTypes] = useState<Set<string>>(new Set());

  useEffect(() => {
    let instructions = "";
    if (initial?.instructions_json) {
      try {
        const arr = JSON.parse(initial.instructions_json) as string[];
        instructions = arr.join("\n");
      } catch {
        // ignore malformed json
      }
    }
    reset({
      name: initial?.name ?? "",
      notes: initial?.notes ?? "",
      category: initial?.category ?? "",
      equipment: initial?.equipment ?? "",
      level: initial?.level ?? "",
      mechanic: initial?.mechanic ?? "",
      force: initial?.force ?? "",
      instructions,
    });
    setSelectedTags(new Set(initial?.tags ?? []));
    const roles = new Map<string, "primary" | "secondary">();
    for (const m of initial?.primary_muscles ?? []) roles.set(m, "primary");
    for (const m of initial?.secondary_muscles ?? []) roles.set(m, "secondary");
    setMuscleRoles(roles);
    setSelectedPoseTypes(new Set(initial?.pose_types ?? []));
  }, [initial, reset]);

  function togglePoseType(pt: string) {
    setSelectedPoseTypes((prev) => {
      const next = new Set(prev);
      if (next.has(pt)) next.delete(pt);
      else next.add(pt);
      return next;
    });
  }

  function toggleTag(tag: string) {
    setSelectedTags((prev) => {
      const next = new Set(prev);
      if (next.has(tag)) next.delete(tag);
      else next.add(tag);
      return next;
    });
  }

  function cycleMuscle(muscle: string) {
    setMuscleRoles((prev) => {
      const next = new Map(prev);
      const current = next.get(muscle);
      if (!current) next.set(muscle, "primary");
      else if (current === "primary") next.set(muscle, "secondary");
      else next.delete(muscle);
      return next;
    });
  }

  function onSubmit(values: FormValues) {
    const tags = Array.from(selectedTags);
    const normalizedTags =
      tags.length > 1 && tags.includes("unspecified")
        ? tags.filter((t) => t !== "unspecified")
        : tags;

    const instructionLines = values.instructions
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);

    const meta: ExerciseMeta = {
      category: (values.category as ExerciseMeta["category"]) || null,
      equipment: (values.equipment as ExerciseMeta["equipment"]) || null,
      level: (values.level as ExerciseMeta["level"]) || null,
      mechanic: (values.mechanic as ExerciseMeta["mechanic"]) || null,
      force: (values.force as ExerciseMeta["force"]) || null,
      instructions_json: instructionLines.length > 0 ? JSON.stringify(instructionLines) : null,
    };

    const muscles: ExerciseMuscleInput[] = Array.from(muscleRoles.entries()).map(
      ([muscle, role]) => ({ muscle: muscle as ExerciseMuscle, role }),
    );

    const poseTypes = Array.from(selectedPoseTypes).sort();

    onSave(
      values.name.trim(),
      values.notes.trim() || null,
      normalizedTags,
      meta,
      muscles,
      poseTypes,
    );
  }

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      style={{ display: "flex", flexDirection: "column", gap: 14 }}
    >
      {/* Catalog notice */}
      {initial?.is_catalog && (
        <div style={catalogNoteStyle}>
          <strong>Catalog exercise.</strong> Source and catalog ID are read-only and preserved.
          Local edits (name, notes, tags, metadata, muscles) may be overwritten if you re-import
          the catalog in the future.
        </div>
      )}

      {/* Name */}
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

      {/* Notes */}
      <div>
        <label style={labelStyle}>Notes (optional)</label>
        <textarea
          {...register("notes")}
          style={{ ...inputStyle, height: 60, resize: "vertical" }}
          placeholder="Cues, tempo, etc."
        />
      </div>

      {/* Tags */}
      <div>
        <label style={labelStyle}>Tags</label>
        <div style={chipGridStyle}>
          {EXERCISE_TAGS.map((tag) => {
            const active = selectedTags.has(tag);
            return (
              <button
                key={tag}
                type="button"
                onClick={() => toggleTag(tag)}
                style={{
                  ...chipBtnBase,
                  border: `1px solid ${active ? tokens.green : tokens.border}`,
                  background: active ? tokens.green : tokens.cardSubtle,
                  color: active ? tokens.greenText : tokens.textSecondary,
                  fontWeight: active ? 600 : 400,
                }}
              >
                {tag}
              </button>
            );
          })}
        </div>
      </div>

      <div style={dividerStyle} />

      {/* Category + Equipment */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <div>
          <label style={labelStyle}>Category</label>
          <select {...register("category")} style={selectStyle}>
            <option value="">—</option>
            {EXERCISE_CATEGORIES.map((v) => (
              <option key={v} value={v}>{v}</option>
            ))}
          </select>
        </div>
        <div>
          <label style={labelStyle}>Equipment</label>
          <select {...register("equipment")} style={selectStyle}>
            <option value="">—</option>
            {EXERCISE_EQUIPMENT.map((v) => (
              <option key={v} value={v}>{v}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Level + Mechanic + Force */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
        <div>
          <label style={labelStyle}>Level</label>
          <select {...register("level")} style={selectStyle}>
            <option value="">—</option>
            {EXERCISE_LEVELS.map((v) => (
              <option key={v} value={v}>{v}</option>
            ))}
          </select>
        </div>
        <div>
          <label style={labelStyle}>Mechanic</label>
          <select {...register("mechanic")} style={selectStyle}>
            <option value="">—</option>
            {EXERCISE_MECHANICS.map((v) => (
              <option key={v} value={v}>{v}</option>
            ))}
          </select>
        </div>
        <div>
          <label style={labelStyle}>Force</label>
          <select {...register("force")} style={selectStyle}>
            <option value="">—</option>
            {EXERCISE_FORCES.map((v) => (
              <option key={v} value={v}>{v}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Muscles */}
      <div>
        <label style={labelStyle}>
          Muscles{" "}
          <span style={{ color: tokens.textMuted, fontWeight: 400, fontSize: 11 }}>
            tap: none → primary → secondary
          </span>
        </label>
        <div style={chipGridStyle}>
          {EXERCISE_MUSCLES.map((muscle) => {
            const role = muscleRoles.get(muscle);
            const isPrimary = role === "primary";
            const isSecondary = role === "secondary";
            return (
              <button
                key={muscle}
                type="button"
                onClick={() => cycleMuscle(muscle)}
                style={{
                  ...chipBtnBase,
                  border: `1px solid ${
                    isPrimary ? tokens.green : isSecondary ? tokens.blue : tokens.border
                  }`,
                  background: isPrimary
                    ? tokens.green
                    : isSecondary
                      ? tokens.blueBadgeBg
                      : tokens.cardSubtle,
                  color: isPrimary
                    ? tokens.greenText
                    : isSecondary
                      ? tokens.blue
                      : tokens.textSecondary,
                  fontWeight: role ? 600 : 400,
                }}
              >
                {muscle}
                {isPrimary ? " P" : isSecondary ? " S" : ""}
              </button>
            );
          })}
        </div>
      </div>

      {/* Pose types */}
      <div>
        <label style={labelStyle}>
          Pose types{" "}
          <span style={{ color: tokens.textMuted, fontWeight: 400, fontSize: 11 }}>
            yoga only
          </span>
        </label>
        <div style={chipGridStyle}>
          {EXERCISE_POSE_TYPES.map((pt) => {
            const active = selectedPoseTypes.has(pt);
            return (
              <button
                key={pt}
                type="button"
                onClick={() => togglePoseType(pt)}
                style={{
                  ...chipBtnBase,
                  border: `1px solid ${active ? tokens.green : tokens.border}`,
                  background: active ? tokens.green : tokens.cardSubtle,
                  color: active ? tokens.greenText : tokens.textSecondary,
                  fontWeight: active ? 600 : 400,
                }}
              >
                {pt.replace(/_/g, " ")}
              </button>
            );
          })}
        </div>
      </div>

      {/* Instructions */}
      <div>
        <label style={labelStyle}>
          Instructions{" "}
          <span style={{ color: tokens.textMuted, fontWeight: 400, fontSize: 11 }}>
            one step per line
          </span>
        </label>
        <textarea
          {...register("instructions")}
          style={{ ...inputStyle, height: 76, resize: "vertical", fontFamily: "inherit" }}
          placeholder={"Stand with feet shoulder-width apart.\nLower until thighs are parallel."}
        />
      </div>

      {/* Actions */}
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
  fontSize: 12,
  fontWeight: 600,
  marginBottom: 5,
  color: tokens.textSecondary,
  letterSpacing: "0.02em",
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

const selectStyle: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  padding: "7px 10px",
  paddingRight: 30,
  border: `1px solid ${tokens.borderMedium}`,
  borderRadius: 8,
  fontSize: 13,
  background: tokens.bg,
  color: tokens.textPrimary,
  outline: "none",
  cursor: "pointer",
  appearance: "none",
  WebkitAppearance: "none",
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath fill='%238e8e93' d='M6 8L0 0h12z'/%3E%3C/svg%3E")`,
  backgroundRepeat: "no-repeat",
  backgroundPosition: "right 10px center",
};

const chipGridStyle: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 5,
  marginTop: 2,
};

const chipBtnBase: React.CSSProperties = {
  padding: "3px 9px",
  borderRadius: 6,
  fontSize: 12,
  cursor: "pointer",
  transition: "background 0.1s, border-color 0.1s, color 0.1s",
};

const dividerStyle: React.CSSProperties = {
  height: 1,
  background: tokens.divider,
  margin: "0 -2px",
};

const errorStyle: React.CSSProperties = {
  color: tokens.red,
  fontSize: 12,
  marginTop: 4,
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

const catalogNoteStyle: React.CSSProperties = {
  padding: "8px 12px",
  borderRadius: 8,
  border: `1px solid ${tokens.purpleBorder}`,
  background: tokens.purpleBg,
  color: tokens.textSecondary,
  fontSize: 12,
  lineHeight: 1.5,
};
