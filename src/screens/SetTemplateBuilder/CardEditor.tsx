import { useEffect, useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { useQuery } from "@tanstack/react-query";
import { exercisesApi } from "../../api/exercises";
import type { Exercise, ExerciseSearchFilters } from "../../types/exercise";
import {
  EXERCISE_CATEGORIES,
  EXERCISE_EQUIPMENT,
  EXERCISE_LEVELS,
  EXERCISE_MUSCLES,
  EXERCISE_TAGS,
  EXERCISE_FORCES,
  EXERCISE_POSE_TYPES,
} from "../../types/exercise";
import type { SetTemplateCard, CardType, PlaceholderTag } from "../../types/setTemplate";
import { tokens } from "../../theme/tokens";

const PLACEHOLDER_TAGS: PlaceholderTag[] = ["unspecified", "push", "pull", "legs", "core", "mobility"];

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

// ── PickerFilterSelect ────────────────────────────────────────────────────────

function PickerFilterSelect({
  value,
  onChange,
  placeholder,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  options: readonly string[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{
        ...pickerFilterSelectStyle,
        border: `1px solid ${value ? tokens.greenBadgeBorder : tokens.border}`,
        color: value ? tokens.textPrimary : tokens.textSecondary,
      }}
    >
      <option value="">{placeholder}</option>
      {options.map((v) => (
        <option key={v} value={v}>{v}</option>
      ))}
    </select>
  );
}

const PICKER_PAGE_SIZE = 40;

// ── ExercisePicker ────────────────────────────────────────────────────────────

function ExercisePicker({
  selectedExercise,
  value,
  onChange,
}: {
  selectedExercise: Exercise | null;
  value: string;
  onChange: (id: string, exercise: Exercise | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [fCategory, setFCategory] = useState("");
  const [fEquipment, setFEquipment] = useState("");
  const [fLevel, setFLevel] = useState("");
  const [fMuscle, setFMuscle] = useState("");
  const [fForce, setFForce] = useState("");
  const [fTag, setFTag] = useState("");
  const [fPoseType, setFPoseType] = useState("");
  const [page, setPage] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const selectedEx = selectedExercise;

  const activeFilterCount = [fCategory, fEquipment, fLevel, fMuscle, fForce, fTag, fPoseType].filter(Boolean).length;

  // Reset to page 0 whenever any search/filter value changes.
  useEffect(() => { setPage(0); }, [search, fCategory, fEquipment, fLevel, fMuscle, fForce, fTag, fPoseType]);

  const pickerFilters: ExerciseSearchFilters = useMemo(() => ({
    query: search || undefined,
    category: fCategory || undefined,
    equipment: fEquipment || undefined,
    level: fLevel || undefined,
    primary_muscle: fMuscle || undefined,
    force: fForce || undefined,
    tag: fTag || undefined,
    pose_type: fPoseType || undefined,
    limit: PICKER_PAGE_SIZE,
    offset: page * PICKER_PAGE_SIZE,
  }), [search, fCategory, fEquipment, fLevel, fMuscle, fForce, fTag, fPoseType, page]);

  const { data: searchResult } = useQuery({
    queryKey: ["exercises", "search", "picker", pickerFilters],
    queryFn: () => exercisesApi.search(pickerFilters),
    enabled: open,
  });

  const filtered = searchResult?.exercises ?? [];
  const totalCount = searchResult?.total ?? 0;
  const pageStart = page * PICKER_PAGE_SIZE + 1;
  const pageEnd = page * PICKER_PAGE_SIZE + filtered.length;
  const hasNext = pageEnd < totalCount;
  const hasPrev = page > 0;

  function clearFilters() {
    setFCategory(""); setFEquipment(""); setFLevel("");
    setFMuscle(""); setFForce(""); setFTag(""); setFPoseType("");
  }

  function goToPage(nextPage: number) {
    setPage(nextPage);
    // Scroll list back to top when changing pages.
    listRef.current?.scrollTo({ top: 0 });
  }

  function pickExercise(ex: Exercise) {
    onChange(ex.id, ex);
    setOpen(false);
  }

  // ── Closed: selection display ─────────────────────────────────────────────
  if (!open) {
    return (
      <div style={pickerClosedStyle}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {selectedEx ? (
            <>
              <div style={pickerSelectedNameStyle}>{selectedEx.name}</div>
              <div style={pickerSelectedMetaStyle}>
                {[selectedEx.category, selectedEx.equipment, selectedEx.level]
                  .filter(Boolean)
                  .join(" · ")}
              </div>
            </>
          ) : (
            <span style={{ fontSize: 14, color: tokens.textSecondary }}>— none selected —</span>
          )}
        </div>
        <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
          {selectedEx && (
            <button type="button" onClick={() => onChange("", null)} style={pickerActionBtnStyle} title="Clear">
              ✕
            </button>
          )}
          <button type="button" onClick={() => setOpen(true)} style={pickerActionBtnStyle}>
            {selectedEx ? "Change" : "Select ▾"}
          </button>
        </div>
      </div>
    );
  }

  // ── Open: search + filters + list ────────────────────────────────────────
  return (
    <div style={pickerOpenStyle}>
      {/* Search row */}
      <div style={pickerSearchRowStyle}>
        <span style={{ fontSize: 15, color: tokens.textSecondary, flexShrink: 0, lineHeight: 1 }}>⌕</span>
        <input
          autoFocus
          type="text"
          placeholder="Search exercises…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={pickerSearchInputStyle}
        />
        <button type="button" onClick={() => setOpen(false)} style={pickerDoneBtnStyle}>
          Done
        </button>
      </div>

      {/* Currently selected indicator */}
      {selectedEx && (
        <div style={pickerSelIndicatorStyle}>
          <span style={{ fontSize: 11, color: tokens.textSecondary }}>Selected: </span>
          <span style={{ fontSize: 11, fontWeight: 700, color: tokens.greenBadgeText }}>
            {selectedEx.name}
          </span>
          <button type="button" onClick={() => onChange("", null)} style={{ ...pickerMiniBtn, marginLeft: "auto" }}>
            Clear ✕
          </button>
        </div>
      )}

      {/* Filter toggle */}
      <div style={pickerFilterRowStyle}>
        <button
          type="button"
          onClick={() => setFiltersOpen((v) => !v)}
          style={{
            ...pickerFilterToggleBtnStyle,
            color: activeFilterCount > 0 ? tokens.greenBadgeText : tokens.textSecondary,
            background: activeFilterCount > 0 ? tokens.greenBadgeBg : "transparent",
            border: `1px solid ${activeFilterCount > 0 ? tokens.greenBadgeBorder : tokens.border}`,
          }}
        >
          {filtersOpen ? "▾" : "▸"} Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}
        </button>
        {activeFilterCount > 0 && (
          <button type="button" onClick={clearFilters} style={pickerMiniBtn}>
            Clear
          </button>
        )}
        <span style={{ marginLeft: "auto", fontSize: 11, color: tokens.textMuted }}>
          {totalCount} total
        </span>
      </div>

      {/* Filter grid */}
      {filtersOpen && (
        <div style={pickerFiltersGridStyle}>
          <PickerFilterSelect value={fCategory} onChange={setFCategory} placeholder="Category" options={EXERCISE_CATEGORIES} />
          <PickerFilterSelect value={fEquipment} onChange={setFEquipment} placeholder="Equipment" options={EXERCISE_EQUIPMENT} />
          <PickerFilterSelect value={fLevel} onChange={setFLevel} placeholder="Level" options={EXERCISE_LEVELS} />
          <PickerFilterSelect value={fMuscle} onChange={setFMuscle} placeholder="Muscle" options={EXERCISE_MUSCLES} />
          <PickerFilterSelect value={fForce} onChange={setFForce} placeholder="Force" options={EXERCISE_FORCES} />
          <PickerFilterSelect value={fTag} onChange={setFTag} placeholder="Tag" options={EXERCISE_TAGS} />
          <PickerFilterSelect value={fPoseType} onChange={setFPoseType} placeholder="Pose type" options={EXERCISE_POSE_TYPES} />
        </div>
      )}

      {/* Scrollable exercise list */}
      <div ref={listRef} style={pickerListStyle}>
        {filtered.length === 0 ? (
          <p style={{ color: tokens.textSecondary, fontSize: 13, padding: "12px 10px", margin: 0, textAlign: "center" }}>
            No exercises match.
          </p>
        ) : (
          filtered.map((ex) => {
            const isSelected = ex.id === value;
            return (
              <button
                key={ex.id}
                type="button"
                onClick={() => pickExercise(ex)}
                style={{
                  ...pickerRowStyle,
                  background: isSelected ? tokens.surfaceSelected : "transparent",
                  borderLeft: isSelected
                    ? `2px solid ${tokens.greenBadgeText}`
                    : "2px solid transparent",
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: 13,
                    fontWeight: isSelected ? 700 : 500,
                    color: tokens.textPrimary,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}>
                    {ex.name}
                  </div>
                  <div style={{
                    fontSize: 11,
                    color: tokens.textSecondary,
                    marginTop: 1,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}>
                    {[ex.category, ex.equipment, ex.level].filter(Boolean).join(" · ")}
                    {ex.primary_muscles.length > 0 && (
                      <span style={{ color: tokens.textMuted }}>
                        {" · "}{ex.primary_muscles.slice(0, 2).join(", ")}
                      </span>
                    )}
                  </div>
                </div>
                {isSelected && (
                  <span style={{ fontSize: 11, color: tokens.greenBadgeText, flexShrink: 0 }}>✓</span>
                )}
              </button>
            );
          })
        )}
      </div>

      {/* Paging footer — shown whenever there are results */}
      {totalCount > 0 && (
        <div style={pickerPagingFooterStyle}>
          <span style={{ fontSize: 10, color: tokens.textMuted }}>
            {`${pageStart}–${pageEnd} of ${totalCount}`}
          </span>
          <div style={{ display: "flex", gap: 3 }}>
            <button
              type="button"
              onClick={() => goToPage(page - 1)}
              disabled={!hasPrev}
              style={pickerPagingBtnStyle(!hasPrev)}
            >
              ‹ Prev
            </button>
            <button
              type="button"
              onClick={() => goToPage(page + 1)}
              disabled={!hasNext}
              style={pickerPagingBtnStyle(!hasNext)}
            >
              Next ›
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── CardEditor ────────────────────────────────────────────────────────────────

export default function CardEditor({ card, onSave, onCancel, saving }: Props) {
  const [selectedExercise, setSelectedExercise] = useState<Exercise | null>(null);

  // Resolve the selected exercise when editing an existing concrete card.
  const exerciseIdToResolve = card?.exercise_id ?? null;
  const { data: resolvedExercise } = useQuery({
    queryKey: ["exercises", "detail", exerciseIdToResolve],
    queryFn: () => exercisesApi.get(exerciseIdToResolve!),
    enabled: !!exerciseIdToResolve && !selectedExercise,
    staleTime: 60_000,
  });

  useEffect(() => {
    if (resolvedExercise && !selectedExercise) {
      setSelectedExercise(resolvedExercise);
    }
  }, [resolvedExercise, selectedExercise]);

  const { register, handleSubmit, watch, reset, setValue } = useForm<FormValues>({
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
  const exerciseId = watch("exercise_id");

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
      <input type="hidden" {...register("exercise_id")} />

      {/* Card type toggle */}
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
        <p style={{ margin: 0, fontSize: 12, color: tokens.textDisabled }}>
          Card type cannot be changed after creation.
        </p>
      )}

      {/* Concrete: exercise picker */}
      {cardType === "concrete" ? (
        <div>
          <label style={labelStyle}>Exercise</label>
          <ExercisePicker
            selectedExercise={selectedExercise}
            value={exerciseId}
            onChange={(id, exercise) => {
              setValue("exercise_id", id);
              setSelectedExercise(exercise);
            }}
          />
        </div>
      ) : (
        /* Placeholder fields */
        <>
          <div>
            <label style={labelStyle}>Tag</label>
            <select {...register("placeholder_tag")} style={selectStyle}>
              {PLACEHOLDER_TAGS.map((t) => (
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

      {/* Shared fields */}
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
        <button type="button" onClick={onCancel} style={cancelBtnStyle} disabled={saving}>
          Cancel
        </button>
        <button type="submit" style={saveBtnStyle} disabled={saving}>
          {saving ? "Saving…" : card ? "Update" : "Add card"}
        </button>
      </div>
    </form>
  );
}

// ── Shared form styles ────────────────────────────────────────────────────────

const labelStyle: React.CSSProperties = {
  display: "block", fontSize: 13, fontWeight: 500, marginBottom: 4,
  color: tokens.textMuted,
};

const inputStyle: React.CSSProperties = {
  width: "100%", boxSizing: "border-box", padding: "8px 10px",
  border: `1px solid ${tokens.borderMedium}`, borderRadius: 8, fontSize: 14,
  background: tokens.bg, color: tokens.textPrimary, outline: "none",
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
  border: `1px solid ${tokens.borderMedium}`,
  background: "transparent", color: tokens.textMuted, cursor: "pointer", fontSize: 14,
};

const saveBtnStyle: React.CSSProperties = {
  padding: "8px 16px", borderRadius: 8, border: "none",
  background: tokens.green, color: "#fff", cursor: "pointer", fontSize: 14, fontWeight: 600,
};

// ── Picker: closed state ──────────────────────────────────────────────────────

const pickerClosedStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "8px 10px",
  border: `1px solid ${tokens.borderMedium}`,
  borderRadius: 8,
  background: tokens.bg,
  minHeight: 44,
};

const pickerSelectedNameStyle: React.CSSProperties = {
  fontWeight: 600,
  fontSize: 14,
  color: tokens.textPrimary,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const pickerSelectedMetaStyle: React.CSSProperties = {
  fontSize: 11,
  color: tokens.textSecondary,
  marginTop: 2,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const pickerActionBtnStyle: React.CSSProperties = {
  padding: "4px 10px",
  borderRadius: 6,
  border: `1px solid ${tokens.borderMedium}`,
  background: tokens.cardSubtle,
  color: tokens.textSecondary,
  cursor: "pointer",
  fontSize: 12,
  fontWeight: 500,
  whiteSpace: "nowrap",
};

// ── Picker: open state ────────────────────────────────────────────────────────

const pickerOpenStyle: React.CSSProperties = {
  border: `1px solid ${tokens.borderMedium}`,
  borderRadius: 8,
  background: tokens.bg,
  padding: "8px 8px 6px",
  display: "flex",
  flexDirection: "column",
  gap: 6,
};

const pickerSearchRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  paddingBottom: 6,
  borderBottom: `1px solid ${tokens.divider}`,
};

const pickerSearchInputStyle: React.CSSProperties = {
  flex: 1,
  background: "none",
  border: "none",
  outline: "none",
  fontSize: 14,
  color: tokens.textPrimary,
  minWidth: 0,
};

const pickerDoneBtnStyle: React.CSSProperties = {
  padding: "3px 10px",
  borderRadius: 5,
  border: `1px solid ${tokens.borderMedium}`,
  background: tokens.cardSubtle,
  color: tokens.textSecondary,
  cursor: "pointer",
  fontSize: 12,
  flexShrink: 0,
};

const pickerSelIndicatorStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 5,
  padding: "4px 8px",
  borderRadius: 5,
  background: tokens.greenBadgeBg,
  border: `1px solid ${tokens.greenBadgeBorder}`,
};

const pickerFilterRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
};

const pickerFilterToggleBtnStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  borderRadius: 5,
  cursor: "pointer",
  padding: "3px 8px",
};

const pickerMiniBtn: React.CSSProperties = {
  fontSize: 11,
  padding: "2px 8px",
  borderRadius: 5,
  border: `1px solid ${tokens.border}`,
  background: "transparent",
  color: tokens.textSecondary,
  cursor: "pointer",
};

const pickerFiltersGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 4,
};

const pickerFilterSelectStyle: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  padding: "4px 22px 4px 7px",
  borderRadius: 5,
  fontSize: 11,
  background: tokens.bg,
  outline: "none",
  cursor: "pointer",
  appearance: "none",
  WebkitAppearance: "none",
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath fill='%238e8e93' d='M5 6L0 0h10z'/%3E%3C/svg%3E")`,
  backgroundRepeat: "no-repeat",
  backgroundPosition: "right 6px center",
};

const pickerListStyle: React.CSSProperties = {
  overflowY: "auto",
  maxHeight: 210,
  borderRadius: 6,
  border: `1px solid ${tokens.divider}`,
};

const pickerRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  width: "100%",
  padding: "8px 10px",
  boxSizing: "border-box",
  gap: 8,
  border: "none",
  borderBottom: `1px solid ${tokens.divider}`,
  cursor: "pointer",
  textAlign: "left",
};

const pickerPagingFooterStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "4px 4px 2px",
  borderTop: `1px solid ${tokens.divider}`,
};

function pickerPagingBtnStyle(disabled: boolean): React.CSSProperties {
  return {
    fontSize: 11,
    fontWeight: 500,
    padding: "3px 8px",
    borderRadius: 5,
    border: `1px solid ${tokens.border}`,
    background: "transparent",
    color: disabled ? tokens.textMuted : tokens.textSecondary,
    cursor: disabled ? "default" : "pointer",
    opacity: disabled ? 0.4 : 1,
  };
}
