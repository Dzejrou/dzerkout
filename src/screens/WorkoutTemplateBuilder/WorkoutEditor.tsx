import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { workoutTemplatesApi } from "../../api/workoutTemplates";
import { setTemplatesApi } from "../../api/setTemplates";
import { exercisesApi } from "../../api/exercises";
import { sessionsApi } from "../../api/sessions";
import { useSessionStore } from "../../store/sessionStore";
import type { WorkoutTemplateSetRef, WorkoutTemplateCardAssignment } from "../../types/workoutTemplate";
import type { SetTemplateCard } from "../../types/setTemplate";
import type { Exercise } from "../../types/exercise";
import { SortableList } from "../../components/SortableList";
import { ConfirmModal } from "../../components/ConfirmModal";
import AssignmentEditor from "./AssignmentEditor";
import SetEditor from "../SetTemplateBuilder/SetEditor";

interface Props {
  workoutId: string;
  onBack: () => void;
}

type Modal =
  | { type: "add-set" }
  | { type: "remove-set"; ref: WorkoutTemplateSetRef }
  | { type: "assignment"; setRef: WorkoutTemplateSetRef; card: SetTemplateCard }
  | { type: "export"; setId: string };

export default function WorkoutEditor({ workoutId, onBack }: Props) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const loadSession = useSessionStore((s) => s.load);
  const [modal, setModal] = useState<Modal | null>(null);
  const [expandedRefId, setExpandedRefId] = useState<string | null>(null);
  const [editingSetId, setEditingSetId] = useState<string | null>(null);
  const [exportName, setExportName] = useState("");
  const [startError, setStartError] = useState<string | null>(null);

  const { data: workout, isLoading } = useQuery({
    queryKey: ["workout-template", workoutId],
    queryFn: () => workoutTemplatesApi.get(workoutId),
  });

  const { data: allExercises = [] } = useQuery({
    queryKey: ["exercises"],
    queryFn: exercisesApi.list,
  });

  const exerciseMap = new Map<string, Exercise>(allExercises.map((e) => [e.id, e]));

  const { data: allSets = [] } = useQuery({
    queryKey: ["set-templates"],
    queryFn: setTemplatesApi.list,
    enabled: modal?.type === "add-set",
  });

  const expandedRef = workout?.set_refs.find((r) => r.id === expandedRefId) ?? null;
  const expandedSetId = expandedRef?.set_template_id ?? null;

  const { data: expandedSetDetail } = useQuery({
    queryKey: ["set-template", expandedSetId],
    queryFn: () => setTemplatesApi.get(expandedSetId!),
    enabled: !!expandedSetId,
  });

  const addSetRefMut = useMutation({
    mutationFn: (setId: string) => workoutTemplatesApi.addSetRef(workoutId, setId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["workout-template", workoutId] });
      setModal(null);
    },
  });

  const removeSetRefMut = useMutation({
    mutationFn: (setRefId: string) => workoutTemplatesApi.removeSetRef(setRefId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["workout-template", workoutId] });
      setModal(null);
    },
  });

  const reorderMut = useMutation({
    mutationFn: (orderedIds: string[]) => workoutTemplatesApi.reorderSetRefs(workoutId, orderedIds),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["workout-template", workoutId] }),
  });

  const cloneMut = useMutation({
    mutationFn: (setRefId: string) => workoutTemplatesApi.cloneSetFromWorkout(setRefId),
    onSuccess: (newRef) => {
      qc.invalidateQueries({ queryKey: ["workout-template", workoutId] });
      qc.invalidateQueries({ queryKey: ["set-templates"] });
      // Update expanded state to the new ref ID so the expand view stays coherent.
      setExpandedRefId((prev) => (prev != null ? newRef.id : null));
    },
  });

  const upsertAssignmentMut = useMutation({
    mutationFn: (params: {
      setRefId: string;
      cardId: string;
      exerciseId: string | null;
      displayLabel: string | null;
      durationHintSec: number | null;
      notes: string | null;
    }) => workoutTemplatesApi.upsertCardAssignment(params),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["workout-template", workoutId] });
      setModal(null);
    },
  });

  const deleteAssignmentMut = useMutation({
    mutationFn: (assignmentId: string) => workoutTemplatesApi.deleteCardAssignment(assignmentId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["workout-template", workoutId] });
      setModal(null);
    },
  });

  const exportForkedSetMut = useMutation({
    mutationFn: ({ setId, newName }: { setId: string; newName: string }) =>
      workoutTemplatesApi.exportForkedSet(setId, newName),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["set-templates"] });
      setModal(null);
      setExportName("");
    },
  });

  const [startPending, setStartPending] = useState(false);

  async function handleStart() {
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

  if (isLoading || !workout) {
    return (
      <div style={pageStyle}>
        <button onClick={onBack} style={backBtnStyle}>← Back</button>
        <p style={{ color: "#6b7280" }}>Loading…</p>
      </div>
    );
  }

  function cardLabel(card: SetTemplateCard, assignment: WorkoutTemplateCardAssignment | undefined): string {
    if (assignment?.display_label) return assignment.display_label;
    // Concrete card: look up exercise name
    const exId = assignment?.exercise_id ?? card.exercise_id;
    if (exId) {
      const ex = exerciseMap.get(exId);
      if (ex) return ex.name;
    }
    // Placeholder fallback
    return card.placeholder_label ?? card.placeholder_tag ?? "Unknown";
  }

  function getAssignment(setRefId: string, cardId: string): WorkoutTemplateCardAssignment | undefined {
    return workout?.assignments.find(
      (a) => a.workout_template_set_ref_id === setRefId && a.set_template_card_id === cardId,
    );
  }

  const assignmentModal = modal?.type === "assignment" ? modal : null;
  const assignmentForCard = assignmentModal
    ? getAssignment(assignmentModal.setRef.id, assignmentModal.card.id)
    : undefined;

  return (
    <div style={pageStyle}>
      <button onClick={onBack} style={backBtnStyle}>← Workouts</button>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>{workout.name}</h2>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => setModal({ type: "add-set" })} style={addBtnStyle}>+ Set</button>
          <button
            onClick={handleStart}
            disabled={startPending}
            style={startBtnStyle}
            title="Start a workout session from this template"
          >
            {startPending ? "Starting…" : "▶ Start"}
          </button>
        </div>
      </div>
      <p style={{ margin: "0 0 4px", fontSize: 12, color: "#6b7280" }}>
        Default duration: {workout.default_exercise_duration_sec}s
        {workout.rest_between_sets_sec != null ? ` · Rest: ${workout.rest_between_sets_sec}s` : ""}
      </p>
      {startError && (
        <p style={{ color: "#dc2626", fontSize: 12, margin: "4px 0 8px" }}>{startError}</p>
      )}

      <div style={{ marginTop: 12 }}>
        <SortableList
          items={workout.set_refs}
          onReorder={(newOrder) => reorderMut.mutate(newOrder.map((r) => r.id))}
          renderItem={(ref) => {
            const isExpanded = expandedRefId === ref.id;
            const cards = isExpanded && expandedSetDetail?.id === ref.set_template_id
              ? expandedSetDetail?.cards ?? []
              : [];

            return (
              <div style={setRefStyle}>
                <div style={{ display: "flex", alignItems: "center" }}>
                  <button
                    onClick={() => setExpandedRefId(isExpanded ? null : ref.id)}
                    style={expandBtnStyle}
                  >
                    {isExpanded ? "▾" : "▸"}
                  </button>
                  <span
                    style={{ flex: 1, fontWeight: 500, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}
                    onClick={() => setExpandedRefId(isExpanded ? null : ref.id)}
                  >
                    {ref.set_name}
                    {ref.source_set_template_id !== null && (
                      <span style={forkedBadgeStyle}>Forked</span>
                    )}
                  </span>
                  <div style={{ display: "flex", gap: 6 }}>
                    {ref.source_set_template_id !== null ? (
                      <>
                        <button
                          onClick={() => setEditingSetId(ref.set_template_id)}
                          style={iconBtnStyle}
                          title="Edit this workout-local set"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => { setExportName(""); setModal({ type: "export", setId: ref.set_template_id }); }}
                          style={{ ...iconBtnStyle, color: "#7c3aed" }}
                          title="Export as a reusable set in the library"
                        >
                          Export
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => cloneMut.mutate(ref.id)}
                        style={iconBtnStyle}
                        disabled={cloneMut.isPending}
                        title="Fork set into a workout-local copy"
                      >
                        Fork
                      </button>
                    )}
                    <button
                      onClick={() => setModal({ type: "remove-set", ref })}
                      style={{ ...iconBtnStyle, color: "#dc2626" }}
                    >
                      ✕
                    </button>
                  </div>
                </div>

                {isExpanded && (
                  <div style={{ marginTop: 8, paddingLeft: 24 }}>
                    {cards.length === 0 && (
                      <p style={{ fontSize: 12, color: "#9ca3af" }}>No cards</p>
                    )}
                    {cards.map((card) => {
                      const assignment = getAssignment(ref.id, card.id);
                      return (
                        <div
                          key={card.id}
                          style={cardItemStyle}
                          onClick={() => setModal({ type: "assignment", setRef: ref, card })}
                        >
                          <span
                            style={{
                              fontSize: 11, padding: "1px 5px", borderRadius: 3,
                              background: card.card_type === "concrete" ? "#dbeafe" : "#fef3c7",
                              color: card.card_type === "concrete" ? "#1d4ed8" : "#92400e",
                              marginRight: 6, flexShrink: 0,
                            }}
                          >
                            {card.card_type}
                          </span>
                          <span style={{ fontSize: 13, flex: 1 }}>
                            {cardLabel(card, assignment)}
                          </span>
                          {assignment && (
                            <span style={{ marginLeft: 6, fontSize: 11, color: "#7c3aed", fontWeight: 600, flexShrink: 0 }}>
                              overridden
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          }}
          renderFallbackControls={(_ref, i, total, move) => (
            <div style={{ display: "flex", gap: 4, padding: "4px 12px" }}>
              <button disabled={i === 0} onClick={() => move(i, i - 1)} style={iconBtnStyle}>↑</button>
              <button disabled={i === total - 1} onClick={() => move(i, i + 1)} style={iconBtnStyle}>↓</button>
            </div>
          )}
        />
      </div>

      {workout.set_refs.length === 0 && (
        <p style={{ color: "#9ca3af", textAlign: "center", padding: "24px 0" }}>
          No sets added yet
        </p>
      )}

      {/* Add-set picker */}
      {modal?.type === "add-set" && (
        <div style={overlayStyle}>
          <div style={sheetStyle}>
            <h3 style={{ margin: "0 0 12px" }}>Add set to workout</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 360, overflow: "auto" }}>
              {allSets.map((s) => (
                <button
                  key={s.id}
                  style={setPickerRowStyle}
                  onClick={() => addSetRefMut.mutate(s.id)}
                  disabled={addSetRefMut.isPending}
                >
                  <span style={{ fontWeight: 500 }}>{s.name}</span>
                  <span style={{ fontSize: 12, color: "#6b7280" }}>{s.card_count} cards</span>
                </button>
              ))}
              {allSets.length === 0 && (
                <p style={{ color: "#9ca3af", textAlign: "center" }}>No set templates yet</p>
              )}
            </div>
            <button onClick={() => setModal(null)} style={{ ...cancelBtnStyle, marginTop: 12, width: "100%" }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Remove set ref confirm */}
      {modal?.type === "remove-set" && (
        <ConfirmModal
          title={`Remove "${modal.ref.set_name}" from workout?`}
          message="This removes the set reference and all assignment overrides for it."
          confirmLabel="Remove"
          destructive
          loading={removeSetRefMut.isPending}
          onConfirm={() => removeSetRefMut.mutate(modal.ref.id)}
          onCancel={() => setModal(null)}
        />
      )}

      {/* Assignment editor */}
      {assignmentModal && (
        <div style={overlayStyle}>
          <div style={sheetStyle}>
            <h3 style={{ margin: "0 0 16px" }}>Card override</h3>
            <AssignmentEditor
              card={assignmentModal.card}
              assignment={assignmentForCard}
              saving={upsertAssignmentMut.isPending || deleteAssignmentMut.isPending}
              onCancel={() => setModal(null)}
              onSave={(params) => {
                upsertAssignmentMut.mutate({
                  setRefId: assignmentModal.setRef.id,
                  cardId: assignmentModal.card.id,
                  ...params,
                });
              }}
              onDelete={
                assignmentForCard
                  ? () => deleteAssignmentMut.mutate(assignmentForCard.id)
                  : undefined
              }
            />
          </div>
        </div>
      )}

      {/* Export forked set */}
      {modal?.type === "export" && (
        <div style={overlayStyle}>
          <div style={sheetStyle}>
            <h3 style={{ margin: "0 0 12px" }}>Export to library</h3>
            <p style={{ fontSize: 13, color: "#6b7280", marginBottom: 12 }}>
              Creates a new reusable set in the global library. The workout-local fork is unchanged.
            </p>
            <input
              autoFocus
              value={exportName}
              onChange={(e) => setExportName(e.target.value)}
              placeholder="New set name…"
              style={exportInputStyle}
            />
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <button
                onClick={() => exportForkedSetMut.mutate({ setId: modal.setId, newName: exportName })}
                disabled={exportForkedSetMut.isPending || !exportName.trim()}
                style={{ ...addBtnStyle, flex: 1 }}
              >
                {exportForkedSetMut.isPending ? "Exporting…" : "Export"}
              </button>
              <button onClick={() => setModal(null)} style={{ ...cancelBtnStyle, flex: 1 }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Inline set editor for workout-local forked sets */}
      {editingSetId && (
        <div style={{ ...overlayStyle, alignItems: "stretch" }}>
          <div style={{ ...sheetStyle, borderRadius: 0, maxHeight: "100vh" }}>
            <SetEditor
              setId={editingSetId}
              onBack={() => {
                setEditingSetId(null);
                qc.invalidateQueries({ queryKey: ["workout-template", workoutId] });
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

const pageStyle: React.CSSProperties = { padding: 16, maxWidth: 600, margin: "0 auto" };
const backBtnStyle: React.CSSProperties = {
  background: "none", border: "none", cursor: "pointer",
  color: "#2563eb", fontWeight: 500, fontSize: 14, padding: "0 0 12px", display: "block",
};
const addBtnStyle: React.CSSProperties = {
  padding: "6px 14px", borderRadius: 6, border: "none",
  background: "#2563eb", color: "#fff", cursor: "pointer", fontWeight: 600,
};
const startBtnStyle: React.CSSProperties = {
  padding: "6px 14px", borderRadius: 6, border: "none",
  background: "#16a34a", color: "#fff", cursor: "pointer", fontWeight: 600,
};
const setRefStyle: React.CSSProperties = {
  padding: "10px 12px", background: "#fff", border: "1px solid #e5e7eb",
  borderRadius: 8, marginBottom: 4,
};
const expandBtnStyle: React.CSSProperties = {
  background: "none", border: "none", cursor: "pointer",
  fontSize: 14, color: "#6b7280", padding: "0 8px 0 0",
};
const iconBtnStyle: React.CSSProperties = {
  padding: "4px 10px", borderRadius: 5, border: "1px solid #e5e7eb",
  background: "#f9fafb", cursor: "pointer", fontSize: 12,
};
const cardItemStyle: React.CSSProperties = {
  padding: "6px 10px", borderRadius: 6, marginBottom: 2,
  background: "#f8fafc", border: "1px solid #e5e7eb",
  cursor: "pointer", display: "flex", alignItems: "center",
};
const overlayStyle: React.CSSProperties = {
  position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)",
  display: "flex", alignItems: "flex-end", zIndex: 100,
};
const sheetStyle: React.CSSProperties = {
  width: "100%", background: "#fff", borderRadius: "16px 16px 0 0",
  padding: "24px 20px", boxShadow: "0 -4px 24px rgba(0,0,0,0.12)", maxHeight: "90vh", overflow: "auto",
};
const setPickerRowStyle: React.CSSProperties = {
  display: "flex", justifyContent: "space-between", alignItems: "center",
  padding: "10px 12px", background: "#f9fafb", border: "1px solid #e5e7eb",
  borderRadius: 8, cursor: "pointer", fontSize: 14,
};
const cancelBtnStyle: React.CSSProperties = {
  padding: "8px 14px", borderRadius: 6, border: "1px solid #d1d5db",
  background: "#f9fafb", cursor: "pointer", fontSize: 14,
};
const forkedBadgeStyle: React.CSSProperties = {
  fontSize: 10, fontWeight: 700, padding: "2px 6px", borderRadius: 4,
  background: "#f0fdf4", color: "#15803d", border: "1px solid #86efac",
  letterSpacing: "0.03em", flexShrink: 0,
};
const exportInputStyle: React.CSSProperties = {
  width: "100%", padding: "8px 12px", borderRadius: 6, border: "1px solid #d1d5db",
  fontSize: 14, boxSizing: "border-box",
};
