import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { tokens } from "../../theme/tokens";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { workoutTemplatesApi } from "../../api/workoutTemplates";
import { setTemplatesApi } from "../../api/setTemplates";
import { exercisesApi } from "../../api/exercises";
import { sessionsApi } from "../../api/sessions";
import { useSessionStore } from "../../store/sessionStore";
import { useForm } from "react-hook-form";
import type { WorkoutTemplateSummary, WorkoutTemplateCardAssignment } from "../../types/workoutTemplate";
import type { Exercise } from "../../types/exercise";
import { ConfirmModal } from "../../components/ConfirmModal";
import WorkoutEditor from "./WorkoutEditor";

type Modal =
  | { type: "create" }
  | { type: "delete"; workout: WorkoutTemplateSummary };

interface CreateForm {
  name: string;
  notes: string;
  defaultDurationSec: string;
  restSec: string;
}

// ── Stat tile ──────────────────────────────────────────────────────────────────

function StatTile({ value, label }: { value: string; label: string }) {
  return (
    <div style={statTileStyle}>
      <span style={statValueStyle}>{value}</span>
      <span style={statLabelStyle}>{label}</span>
    </div>
  );
}

// ── Expanded set cards ────────────────────────────────────────────────────────

function SetRefExpandedContent({
  setTemplateId,
  setRefId,
  assignments,
}: {
  setTemplateId: string;
  setRefId: string;
  assignments: WorkoutTemplateCardAssignment[];
}) {
  const { data: setDetail, isLoading } = useQuery({
    queryKey: ["set-template", setTemplateId],
    queryFn: () => setTemplatesApi.get(setTemplateId),
  });

  const { data: allExercises = [] } = useQuery({
    queryKey: ["exercises"],
    queryFn: exercisesApi.list,
  });

  const exerciseMap = new Map<string, Exercise>(allExercises.map((e) => [e.id, e]));
  const refAssignments = assignments.filter((a) => a.workout_template_set_ref_id === setRefId);

  if (isLoading || !setDetail) {
    return (
      <p style={{ fontSize: 12, color: tokens.textMuted, padding: "8px 14px 10px", borderTop: `1px solid ${tokens.surfaceSelected}` }}>
        Loading…
      </p>
    );
  }

  if (setDetail.cards.length === 0) {
    return (
      <p style={{ fontSize: 12, color: tokens.textDisabled, padding: "8px 14px 10px", borderTop: `1px solid ${tokens.surfaceSelected}` }}>
        Empty set
      </p>
    );
  }

  return (
    <div style={{ borderTop: `1px solid ${tokens.surfaceSelected}` }}>
      {setDetail.cards.map((card, i) => {
        const assignment = refAssignments.find((a) => a.set_template_card_id === card.id);
        const label =
          assignment?.display_label ??
          (card.card_type === "placeholder"
            ? (card.placeholder_label ?? card.placeholder_tag ?? "Placeholder")
            : (card.exercise_id ? (exerciseMap.get(card.exercise_id)?.name ?? "Unknown exercise") : "Unknown exercise"));
        const duration = assignment?.duration_hint_sec ?? card.duration_hint_sec;

        return (
          <div key={card.id} style={expandedCardRowStyle}>
            <span style={expandedCardNumStyle}>{i + 1}</span>
            <span style={expandedCardBadgeStyle(card.card_type)}>
              {card.card_type === "concrete" ? "CONCRETE" : "PLACEHOLDER"}
            </span>
            <span style={expandedCardLabelStyle}>{label}</span>
            {duration != null && <span style={expandedCardDurStyle}>{duration}s</span>}
          </div>
        );
      })}
    </div>
  );
}

// ── Right-side preview pane ───────────────────────────────────────────────────

function PreviewPane({
  workoutId,
  onEdit,
  onDelete,
  onStart,
  startPending,
  startError,
}: {
  workoutId: string;
  onEdit: () => void;
  onDelete: () => void;
  onStart: () => void;
  startPending: boolean;
  startError: string | null;
}) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  function toggleRef(refId: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(refId)) next.delete(refId);
      else next.add(refId);
      return next;
    });
  }

  const { data: workout, isLoading } = useQuery({
    queryKey: ["workout-template", workoutId],
    queryFn: () => workoutTemplatesApi.get(workoutId),
  });

  if (isLoading || !workout) {
    return (
      <div style={previewPaneStyle}>
        <p style={{ color: tokens.textSecondary, padding: 8 }}>Loading…</p>
      </div>
    );
  }

  function fmtDate(s: string) {
    return new Date(s).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  }

  const statTiles: { value: string; label: string }[] = [
    { value: String(workout.set_refs.length), label: "SETS" },
    { value: `${workout.default_exercise_duration_sec}s`, label: "DEFAULT DURATION" },
    ...(workout.rest_between_sets_sec != null
      ? [{ value: `${workout.rest_between_sets_sec}s`, label: "REST BETWEEN SETS" }]
      : []),
  ];

  return (
    <div style={previewPaneStyle}>
      {/* Name + dates */}
      <div style={previewHeaderStyle}>
        <h2 style={previewNameStyle}>{workout.name}</h2>
        <p style={previewDatesStyle}>
          Created {fmtDate(workout.created_at)} · Updated {fmtDate(workout.updated_at)}
        </p>
      </div>

      {/* Notes */}
      {workout.notes && <p style={previewNotesStyle}>{workout.notes}</p>}

      {/* Stat tiles */}
      <div style={statRowStyle}>
        {statTiles.map((t) => <StatTile key={t.label} value={t.value} label={t.label} />)}
      </div>

      {/* Divider */}
      <div style={dividerStyle} />

      {/* Workout structure */}
      <h3 style={sectionTitleStyle}>Workout Structure</h3>
      <div style={setRefsListStyle}>
        {workout.set_refs.length === 0 ? (
          <p style={{ color: tokens.textMuted, fontSize: 13, padding: "12px 0", textAlign: "center" }}>
            No sets added yet
          </p>
        ) : (
          workout.set_refs.map((ref, i) => {
            const isExpanded = expandedIds.has(ref.id);
            return (
              <div key={ref.id} style={setRefContainerStyle}>
                <div onClick={() => toggleRef(ref.id)} style={setRefRowStyle}>
                  <span style={setRefNumStyle}>Set {i + 1}</span>
                  <span style={setRefNameStyle}>{ref.set_name}</span>
                  {ref.source_set_template_id !== null && (
                    <span style={forkedBadgeStyle}>Forked</span>
                  )}
                  <span style={{ ...setRefChevronStyle, display: "inline-block", transform: isExpanded ? "rotate(90deg)" : "none", transition: "transform 0.15s ease" }}>›</span>
                </div>
                {isExpanded && (
                  <SetRefExpandedContent
                    setTemplateId={ref.set_template_id}
                    setRefId={ref.id}
                    assignments={workout.assignments}
                  />
                )}
              </div>
            );
          })
        )}
      </div>

      {startError && <p style={{ color: tokens.red, fontSize: 12, marginTop: 8 }}>{startError}</p>}

      {/* Actions */}
      <div style={previewActionsStyle}>
        <button onClick={onStart} disabled={startPending} style={startActionBtnStyle}>
          {startPending ? "Starting…" : "▶ Start Workout"}
        </button>
        <button onClick={onEdit} style={editActionBtnStyle}>✏ Edit Workout</button>
        <button onClick={onDelete} style={deleteActionBtnStyle}>Delete</button>
      </div>
    </div>
  );
}

// ── Left-side list card ────────────────────────────────────────────────────────

function WorkoutListCard({
  workout,
  isSelected,
  onSelect,
}: {
  workout: WorkoutTemplateSummary;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const meta = [
    `${workout.set_count} set${workout.set_count !== 1 ? "s" : ""}`,
    `${workout.default_exercise_duration_sec}s / set`,
    workout.rest_between_sets_sec != null ? `${workout.rest_between_sets_sec}s rest` : null,
  ]
    .filter(Boolean)
    .join(" • ");

  return (
    <div
      onClick={onSelect}
      style={{
        ...listCardStyle,
        background: isSelected ? tokens.surfaceActive : tokens.card,
        border: isSelected
          ? "1px solid rgba(255,255,255,0.22)"
          : `1px solid ${tokens.borderSubtle}`,
        boxShadow: isSelected ? "inset 3px 0 0 rgba(255,255,255,0.3)" : "none",
      }}
    >
      <span style={listCardNameStyle}>{workout.name}</span>
      <span style={listCardMetaStyle}>{meta}</span>
      {workout.notes && <span style={listCardNotesStyle}>{workout.notes}</span>}
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function WorkoutTemplateBuilder() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const loadSession = useSessionStore((s) => s.load);

  const [previewId, setPreviewId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [modal, setModal] = useState<Modal | null>(null);
  const [search, setSearch] = useState("");
  const [startPending, setStartPending] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);

  const { data: workouts = [], isLoading } = useQuery({
    queryKey: ["workout-templates"],
    queryFn: workoutTemplatesApi.list,
  });

  const { register, handleSubmit, reset, formState: { errors } } = useForm<CreateForm>({
    defaultValues: { name: "", notes: "", defaultDurationSec: "45", restSec: "" },
  });

  const createMut = useMutation({
    mutationFn: (data: CreateForm) =>
      workoutTemplatesApi.create({
        name: data.name.trim(),
        notes: data.notes.trim() || null,
        defaultDurationSec: parseInt(data.defaultDurationSec, 10) || 45,
        restSec: data.restSec ? parseInt(data.restSec, 10) : null,
      }),
    onSuccess: (created) => {
      qc.invalidateQueries({ queryKey: ["workout-templates"] });
      setModal(null);
      reset();
      setEditingId(created.id);
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => workoutTemplatesApi.delete(id),
    onSuccess: (_, deletedId) => {
      qc.invalidateQueries({ queryKey: ["workout-templates"] });
      setModal(null);
      if (previewId === deletedId) setPreviewId(null);
    },
  });

  async function handleStart(workoutId: string) {
    setStartError(null);
    setStartPending(true);
    try {
      const payload = await sessionsApi.createDraft(workoutId);
      loadSession(payload);
      navigate("/runner");
    } catch (e) {
      setStartError(String(e));
    } finally {
      setStartPending(false);
    }
  }

  // Full-page editor replaces the whole view
  if (editingId) {
    return (
      <WorkoutEditor
        workoutId={editingId}
        onBack={() => setEditingId(null)}
      />
    );
  }

  const filtered = search.trim()
    ? workouts.filter((w) => w.name.toLowerCase().includes(search.toLowerCase()))
    : workouts;

  // Keep previewId valid as workouts change (e.g. after search clears a selection)
  const previewWorkout = filtered.find((w) => w.id === previewId) ?? null;
  const resolvedPreviewId = previewWorkout ? previewId : null;

  return (
    <div style={rootStyle}>
      {/* Fixed header above the split */}
      <div style={headerAreaStyle}>
        <div style={topBarStyle}>
          <button onClick={() => navigate("/")} style={backBtnStyle}>← BACK</button>
        </div>
        <div style={pageHeaderStyle}>
          <div>
            <h1 style={pageTitleStyle}>Workouts</h1>
            <p style={pageSubtitleStyle}>Create and manage your workout templates.</p>
          </div>
          <button onClick={() => setModal({ type: "create" })} style={newBtnStyle}>
            + New Workout
          </button>
        </div>
      </div>

      {/* Split area: left list + right preview */}
      <div style={splitAreaStyle}>
        {/* Left panel */}
        <div style={leftPanelStyle}>
          {/* Search */}
          <div style={searchWrapStyle}>
            <span style={searchIconStyle}>⌕</span>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search workouts…"
              style={searchInputStyle}
            />
          </div>

          {/* List */}
          <div style={cardListStyle}>
            {isLoading && <p style={{ color: tokens.textSecondary, fontSize: 13, padding: "8px 0" }}>Loading…</p>}
            {!isLoading && filtered.length === 0 && (
              <p style={emptyStyle}>{search ? "No matches." : "No workouts yet."}</p>
            )}
            {filtered.map((w) => (
              <WorkoutListCard
                key={w.id}
                workout={w}
                isSelected={w.id === resolvedPreviewId}
                onSelect={() => setPreviewId(w.id)}
              />
            ))}
          </div>

          {!isLoading && (
            <p style={countLabelStyle}>
              {filtered.length} workout{filtered.length !== 1 ? "s" : ""}
            </p>
          )}
        </div>

        {/* Right panel */}
        <div style={rightPanelStyle}>
          {resolvedPreviewId ? (
            <PreviewPane
              key={resolvedPreviewId}
              workoutId={resolvedPreviewId}
              onEdit={() => setEditingId(resolvedPreviewId)}
              onDelete={() => {
                const w = filtered.find((x) => x.id === resolvedPreviewId);
                if (w) setModal({ type: "delete", workout: w });
              }}
              onStart={() => handleStart(resolvedPreviewId)}
              startPending={startPending}
              startError={startError}
            />
          ) : (
            <div style={emptyPaneStyle}>
              <p style={emptyPaneLabelStyle}>Select a workout to preview</p>
            </div>
          )}
        </div>
      </div>

      {/* Create modal */}
      {modal?.type === "create" && (
        <div style={overlayStyle}>
          <div style={sheetStyle}>
            <h3 style={sheetTitleStyle}>New workout template</h3>
            <form
              onSubmit={handleSubmit((data) => createMut.mutate(data))}
              style={{ display: "flex", flexDirection: "column", gap: 14 }}
            >
              <div>
                <label style={labelStyle}>Name</label>
                <input
                  {...register("name", { required: "Name is required" })}
                  style={inputStyle}
                  placeholder="e.g. Push Day"
                  autoFocus
                />
                {errors.name && <p style={fieldErrorStyle}>{errors.name.message}</p>}
              </div>
              <div>
                <label style={labelStyle}>Notes (optional)</label>
                <input {...register("notes")} style={inputStyle} placeholder="Short description…" />
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <div style={{ flex: 1 }}>
                  <label style={labelStyle}>Default duration (sec)</label>
                  <input type="number" min={1} {...register("defaultDurationSec")} style={inputStyle} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={labelStyle}>Rest between sets (sec)</label>
                  <input type="number" min={0} {...register("restSec")} style={inputStyle} placeholder="none" />
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 4 }}>
                <button
                  type="button"
                  onClick={() => { setModal(null); reset(); }}
                  style={cancelBtnStyle}
                  disabled={createMut.isPending}
                >
                  Cancel
                </button>
                <button type="submit" style={saveBtnStyle} disabled={createMut.isPending}>
                  {createMut.isPending ? "Creating…" : "Create"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {modal?.type === "delete" && (
        <ConfirmModal
          title={`Delete "${modal.workout.name}"?`}
          message="This workout template and all its configuration will be permanently deleted."
          confirmLabel="Delete"
          destructive
          loading={deleteMut.isPending}
          onConfirm={() => deleteMut.mutate(modal.workout.id)}
          onCancel={() => setModal(null)}
        />
      )}
    </div>
  );
}

// ── Page chrome styles ────────────────────────────────────────────────────────

const rootStyle: React.CSSProperties = {
  height: "100%",
  background: tokens.bg,
  color: tokens.textPrimary,
  display: "flex",
  flexDirection: "column",
  overflow: "hidden",
};

const headerAreaStyle: React.CSSProperties = {
  flexShrink: 0,
};

const topBarStyle: React.CSSProperties = {
  padding: "14px 24px 0",
};

const backBtnStyle: React.CSSProperties = {
  background: tokens.border,
  border: `1px solid ${tokens.borderMedium}`,
  borderRadius: 8,
  color: tokens.textFaint,
  cursor: "pointer",
  fontSize: 12,
  fontWeight: 600,
  letterSpacing: "0.06em",
  padding: "6px 14px",
};

const pageHeaderStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "flex-end",
  justifyContent: "space-between",
  padding: "20px 24px 16px",
  gap: 16,
};

const pageTitleStyle: React.CSSProperties = {
  fontSize: 40,
  fontWeight: 800,
  margin: "0 0 4px",
  color: tokens.textPrimary,
  letterSpacing: "-0.02em",
  lineHeight: 1,
};

const pageSubtitleStyle: React.CSSProperties = {
  fontSize: 13,
  color: tokens.textSecondary,
  margin: 0,
};

const newBtnStyle: React.CSSProperties = {
  padding: "9px 18px",
  borderRadius: 10,
  border: `1px solid ${tokens.borderStrong}`,
  background: tokens.cardSubtle,
  color: tokens.textPrimary,
  cursor: "pointer",
  fontSize: 14,
  fontWeight: 600,
  flexShrink: 0,
  whiteSpace: "nowrap",
};

// ── Split area ────────────────────────────────────────────────────────────────

const splitAreaStyle: React.CSSProperties = {
  flex: 1,
  display: "flex",
  overflow: "hidden",
  minHeight: 0,
};

// ── Left panel ────────────────────────────────────────────────────────────────

const leftPanelStyle: React.CSSProperties = {
  width: 390,
  flexShrink: 0,
  display: "flex",
  flexDirection: "column",
  overflowY: "auto",
  borderRight: `1px solid ${tokens.borderSubtle}`,
  padding: "0 16px 24px",
};

const searchWrapStyle: React.CSSProperties = {
  position: "relative",
  paddingTop: 4,
  paddingBottom: 12,
};

const searchIconStyle: React.CSSProperties = {
  position: "absolute",
  left: 12,
  top: "50%",
  transform: "translateY(-4px)",
  color: tokens.textMuted,
  fontSize: 16,
  pointerEvents: "none",
  lineHeight: 1,
};

const searchInputStyle: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  padding: "9px 12px 9px 34px",
  background: tokens.card,
  border: `1px solid ${tokens.border}`,
  borderRadius: 8,
  color: tokens.textPrimary,
  fontSize: 14,
  outline: "none",
};

const cardListStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
  flex: 1,
};

const emptyStyle: React.CSSProperties = {
  color: tokens.textMuted,
  fontSize: 13,
  padding: "24px 0",
  textAlign: "center",
};

const countLabelStyle: React.CSSProperties = {
  textAlign: "center",
  fontSize: 11,
  color: tokens.textDisabled,
  marginTop: 14,
};

// ── List card ─────────────────────────────────────────────────────────────────

const listCardStyle: React.CSSProperties = {
  borderRadius: 10,
  padding: "14px 16px",
  cursor: "pointer",
  display: "flex",
  flexDirection: "column",
  gap: 4,
  transition: "background 0.1s, border-color 0.1s",
};

const listCardNameStyle: React.CSSProperties = {
  fontSize: 15,
  fontWeight: 700,
  color: tokens.textPrimary,
  lineHeight: 1.2,
};

const listCardMetaStyle: React.CSSProperties = {
  fontSize: 12,
  color: tokens.textSecondary,
};

const listCardNotesStyle: React.CSSProperties = {
  fontSize: 12,
  color: tokens.textMuted,
  overflow: "hidden",
  display: "-webkit-box",
  WebkitLineClamp: 1,
  WebkitBoxOrient: "vertical",
};

// ── Right panel ───────────────────────────────────────────────────────────────

const rightPanelStyle: React.CSSProperties = {
  flex: 1,
  overflowY: "auto",
  minWidth: 0,
};

const emptyPaneStyle: React.CSSProperties = {
  height: "100%",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

const emptyPaneLabelStyle: React.CSSProperties = {
  color: tokens.textDisabled,
  fontSize: 14,
};

// ── Preview pane ──────────────────────────────────────────────────────────────

const previewPaneStyle: React.CSSProperties = {
  padding: "28px 32px 40px",
  display: "flex",
  flexDirection: "column",
  gap: 0,
};

const previewHeaderStyle: React.CSSProperties = {
  marginBottom: 6,
};

const previewNameStyle: React.CSSProperties = {
  fontSize: 26,
  fontWeight: 700,
  margin: "0 0 6px",
  color: tokens.textPrimary,
};

const previewDatesStyle: React.CSSProperties = {
  fontSize: 12,
  color: tokens.textMuted,
  margin: 0,
};

const previewNotesStyle: React.CSSProperties = {
  fontSize: 14,
  color: tokens.textFaint,
  margin: "12px 0 0",
  lineHeight: 1.5,
};

const statRowStyle: React.CSSProperties = {
  display: "flex",
  gap: 10,
  marginTop: 20,
  flexWrap: "wrap",
};

const statTileStyle: React.CSSProperties = {
  background: tokens.card,
  border: `1px solid ${tokens.divider}`,
  borderRadius: 10,
  padding: "12px 16px",
  display: "flex",
  flexDirection: "column",
  gap: 4,
  minWidth: 80,
};

const statValueStyle: React.CSSProperties = {
  fontSize: 22,
  fontWeight: 700,
  color: tokens.textPrimary,
  lineHeight: 1,
};

const statLabelStyle: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 600,
  color: tokens.textMuted,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
};

const dividerStyle: React.CSSProperties = {
  height: 1,
  background: tokens.divider,
  margin: "24px 0 20px",
};

const sectionTitleStyle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  color: tokens.textSecondary,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  margin: "0 0 12px",
};

const setRefsListStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 4,
  marginBottom: 28,
};

const setRefContainerStyle: React.CSSProperties = {
  background: tokens.card,
  border: `1px solid ${tokens.borderSubtle}`,
  borderRadius: 8,
  overflow: "hidden",
};

const setRefRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  padding: "10px 14px",
  cursor: "pointer",
};

const setRefNumStyle: React.CSSProperties = {
  fontSize: 12,
  color: tokens.textMuted,
  minWidth: 36,
  flexShrink: 0,
};

const setRefNameStyle: React.CSSProperties = {
  flex: 1,
  fontSize: 14,
  color: tokens.textLight,
};

const forkedBadgeStyle: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  padding: "2px 7px",
  borderRadius: 4,
  background: tokens.greenBadgeBg,
  color: tokens.greenText,
  border: `1px solid ${tokens.greenBadgeBorder}`,
  letterSpacing: "0.04em",
  flexShrink: 0,
};

const setRefChevronStyle: React.CSSProperties = {
  fontSize: 16,
  color: tokens.textDisabled,
  flexShrink: 0,
};

const previewActionsStyle: React.CSSProperties = {
  display: "flex",
  gap: 10,
  alignItems: "center",
};

const startActionBtnStyle: React.CSSProperties = {
  flex: 1,
  padding: "11px 0",
  borderRadius: 10,
  border: "none",
  background: tokens.green,
  color: tokens.greenText,
  cursor: "pointer",
  fontSize: 14,
  fontWeight: 700,
};

const editActionBtnStyle: React.CSSProperties = {
  flex: 1,
  padding: "11px 0",
  borderRadius: 10,
  border: `1px solid ${tokens.borderMedium}`,
  background: tokens.cardSubtle,
  color: tokens.textPrimary,
  cursor: "pointer",
  fontSize: 14,
  fontWeight: 600,
};

const deleteActionBtnStyle: React.CSSProperties = {
  padding: "11px 16px",
  borderRadius: 10,
  border: `1px solid ${tokens.redBorder}`,
  background: tokens.redBg,
  color: tokens.red,
  cursor: "pointer",
  fontSize: 14,
  fontWeight: 600,
};

// ── Modal / sheet ─────────────────────────────────────────────────────────────

const overlayStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: tokens.overlay,
  display: "flex",
  alignItems: "flex-end",
  zIndex: 100,
};

const sheetStyle: React.CSSProperties = {
  width: "100%",
  maxWidth: 520,
  margin: "0 auto",
  background: tokens.card,
  borderRadius: "16px 16px 0 0",
  padding: "24px 22px 32px",
  boxShadow: "0 -8px 40px rgba(0,0,0,0.5)",
  maxHeight: "90vh",
  overflow: "auto",
  boxSizing: "border-box",
};

const sheetTitleStyle: React.CSSProperties = {
  margin: "0 0 18px",
  fontSize: 17,
  fontWeight: 700,
  color: tokens.textPrimary,
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 12,
  fontWeight: 600,
  color: tokens.textSecondary,
  letterSpacing: "0.05em",
  textTransform: "uppercase",
  marginBottom: 6,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  padding: "9px 11px",
  background: tokens.bg,
  border: `1px solid ${tokens.borderMedium}`,
  borderRadius: 8,
  color: tokens.textPrimary,
  fontSize: 14,
  outline: "none",
};

const cancelBtnStyle: React.CSSProperties = {
  padding: "8px 16px",
  borderRadius: 8,
  border: `1px solid ${tokens.borderMedium}`,
  background: "transparent",
  color: tokens.textFaint,
  cursor: "pointer",
  fontSize: 14,
};

const saveBtnStyle: React.CSSProperties = {
  padding: "8px 20px",
  borderRadius: 8,
  border: "none",
  background: tokens.textPrimary,
  color: tokens.bg,
  cursor: "pointer",
  fontSize: 14,
  fontWeight: 700,
};

const fieldErrorStyle: React.CSSProperties = {
  color: tokens.red,
  fontSize: 12,
  marginTop: 4,
};

// ── Expanded set card rows ────────────────────────────────────────────────────

const expandedCardRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "8px 14px",
  borderTop: `1px solid ${tokens.surfaceSelected}`,
};

const expandedCardNumStyle: React.CSSProperties = {
  fontSize: 12,
  color: tokens.textMuted,
  minWidth: 18,
  textAlign: "right",
  flexShrink: 0,
};

function expandedCardBadgeStyle(type: "concrete" | "placeholder"): React.CSSProperties {
  const isConcrete = type === "concrete";
  return {
    fontSize: 10,
    fontWeight: 700,
    padding: "2px 6px",
    borderRadius: 4,
    flexShrink: 0,
    letterSpacing: "0.04em",
    background: isConcrete ? tokens.blueBadgeBg : tokens.amberBadgeBg,
    color: isConcrete ? tokens.blue : tokens.amber,
    border: `1px solid ${isConcrete ? tokens.blueBadgeBorder : tokens.amberBadgeBorder}`,
  };
}

const expandedCardLabelStyle: React.CSSProperties = {
  flex: 1,
  fontSize: 13,
  color: tokens.textLight,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const expandedCardDurStyle: React.CSSProperties = {
  fontSize: 12,
  color: tokens.textMuted,
  flexShrink: 0,
  fontVariantNumeric: "tabular-nums",
};
