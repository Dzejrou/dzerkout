import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { exercisesApi } from "../../api/exercises";
import type { Exercise } from "../../types/exercise";
import ExerciseForm from "./ExerciseForm";
import { ConfirmModal } from "../../components/ConfirmModal";

import { tokens } from "../../theme/tokens";
const { bg: BG, card: CARD, divider: DIVIDER, textPrimary: TEXT_PRIMARY, textSecondary: TEXT_SECONDARY, border: BORDER } = tokens;

type Modal =
  | { type: "create" }
  | { type: "edit"; exercise: Exercise }
  | { type: "delete"; exercise: Exercise; refs: number };

function formatDateFull(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit",
  });
}

function DetailPane({
  exercise,
  onEdit,
  onDelete,
}: {
  exercise: Exercise;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div style={detailRootStyle}>
      {/* Header */}
      <div style={detailHeaderStyle}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 style={detailTitleStyle}>{exercise.name}</h1>
        </div>
        <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
          <button onClick={onEdit} style={editBtnStyle}>
            <span style={{ marginRight: 5 }}>✏</span>Edit
          </button>
          <button onClick={onDelete} style={deleteBtnStyle}>
            <span style={{ marginRight: 5 }}>🗑</span>Delete
          </button>
        </div>
      </div>

      <div style={detailDividerStyle} />

      {/* Notes section */}
      {exercise.notes && (
        <>
          <section style={detailSectionStyle}>
            <h2 style={sectionHeadingStyle}>Notes</h2>
            <p style={notesTextStyle}>{exercise.notes}</p>
          </section>
          <div style={detailDividerStyle} />
        </>
      )}

      {/* Details section */}
      <section style={detailSectionStyle}>
        <h2 style={sectionHeadingStyle}>Details</h2>
        <div style={detailRowsStyle}>
          <DetailRow icon="📅" label="Created" value={formatDateFull(exercise.created_at)} />
          <DetailRow icon="✏" label="Last updated" value={formatDateFull(exercise.updated_at)} />
        </div>
      </section>
    </div>
  );
}

function DetailRow({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div style={detailRowStyle}>
      <span style={detailRowIconStyle}>{icon}</span>
      <span style={detailRowLabelStyle}>{label}</span>
      <span style={detailRowValueStyle}>{value}</span>
    </div>
  );
}

function EmptyState({ hasSearch }: { hasSearch: boolean }) {
  return (
    <div style={emptyDetailStyle}>
      <p style={{ color: TEXT_SECONDARY, fontSize: 15 }}>
        {hasSearch ? "No exercises match your search." : "No exercises yet. Create one to get started."}
      </p>
    </div>
  );
}

export default function ExerciseLibrary() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [modal, setModal] = useState<Modal | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const { data: exercises = [], isLoading } = useQuery({
    queryKey: ["exercises"],
    queryFn: exercisesApi.list,
  });

  const filtered = exercises.filter((e) =>
    e.name.toLowerCase().includes(search.toLowerCase()),
  );

  const selected = filtered.find((e) => e.id === selectedId) ?? null;

  useEffect(() => {
    if (!selectedId && filtered.length > 0) {
      setSelectedId(filtered[0].id);
    }
  }, [filtered, selectedId]);

  useEffect(() => {
    if (selectedId && !filtered.find((e) => e.id === selectedId)) {
      setSelectedId(filtered.length > 0 ? filtered[0].id : null);
    }
  }, [filtered, selectedId]);

  const createMut = useMutation({
    mutationFn: ({ name, notes }: { name: string; notes: string | null }) =>
      exercisesApi.create(name, notes),
    onSuccess: (created) => {
      qc.invalidateQueries({ queryKey: ["exercises"] });
      setSelectedId(created.id);
      setModal(null);
    },
  });

  const updateMut = useMutation({
    mutationFn: ({ id, name, notes }: { id: string; name: string; notes: string | null }) =>
      exercisesApi.update(id, name, notes),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["exercises"] }); setModal(null); },
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => exercisesApi.delete(id, true),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["exercises"] });
      qc.invalidateQueries({ queryKey: ["set-templates"] });
      setModal(null);
    },
    onError: (e) => setDeleteError(String(e)),
  });

  async function handleDeleteClick(ex: Exercise) {
    setDeleteError(null);
    const refs = await exercisesApi.getReferences(ex.id);
    setModal({ type: "delete", exercise: ex, refs: refs.cards.length });
  }

  return (
    <div style={rootStyle}>
      {/* ── Left panel ── */}
      <div style={leftPanelStyle}>
        <div style={leftHeaderStyle}>
          <button onClick={() => navigate("/")} style={backBtnStyle}>← Back</button>
          <h1 style={pageTitleStyle}>Exercises</h1>
          <p style={pageSubtitleStyle}>Manage your exercise library.</p>

          <div style={toolbarStyle}>
            <div style={searchWrapStyle}>
              <span style={searchIconStyle}>⌕</span>
              <input
                type="text"
                placeholder="Search exercises…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={searchInputStyle}
              />
            </div>
            <button onClick={() => setModal({ type: "create" })} style={newBtnStyle}>
              + New Exercise
            </button>
          </div>
        </div>

        <div style={listStyle}>
          {isLoading && <p style={{ color: TEXT_SECONDARY, padding: "16px 20px" }}>Loading…</p>}
          {!isLoading && filtered.length === 0 && (
            <p style={{ color: TEXT_SECONDARY, padding: "16px 20px", textAlign: "center" }}>
              {search ? "No matches" : "No exercises yet"}
            </p>
          )}
          {filtered.map((ex) => {
            const isSelected = ex.id === selectedId;
            return (
              <button
                key={ex.id}
                onClick={() => setSelectedId(ex.id)}
                style={{
                  ...exerciseRowStyle,
                  background: isSelected ? "rgba(255,255,255,0.04)" : "transparent",
                  borderLeft: isSelected ? "2px solid #4ade80" : "2px solid transparent",
                }}
              >
                <div style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
                  <div style={exNameStyle}>{ex.name}</div>
                  {ex.notes && (
                    <div style={exNotesStyle}>{ex.notes}</div>
                  )}
                </div>
                <span style={chevronStyle}>›</span>
              </button>
            );
          })}
          {filtered.length > 0 && (
            <p style={listCountStyle}>{filtered.length} exercise{filtered.length !== 1 ? "s" : ""}</p>
          )}
        </div>
      </div>

      {/* ── Right panel ── */}
      <div style={rightPanelStyle}>
        {selected ? (
          <DetailPane
            exercise={selected}
            onEdit={() => setModal({ type: "edit", exercise: selected })}
            onDelete={() => handleDeleteClick(selected)}
          />
        ) : (
          <EmptyState hasSearch={!!search} />
        )}
      </div>

      {/* Create / Edit modal */}
      {(modal?.type === "create" || modal?.type === "edit") && (
        <div style={overlayStyle}>
          <div style={modalStyle}>
            <h3 style={modalTitleStyle}>
              {modal.type === "create" ? "New exercise" : "Edit exercise"}
            </h3>
            <ExerciseForm
              initial={modal.type === "edit" ? modal.exercise : undefined}
              saving={createMut.isPending || updateMut.isPending}
              onCancel={() => setModal(null)}
              onSave={(name, notes) => {
                if (modal.type === "create") {
                  createMut.mutate({ name, notes });
                } else {
                  updateMut.mutate({ id: modal.exercise.id, name, notes });
                }
              }}
            />
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {modal?.type === "delete" && (
        <ConfirmModal
          title={`Delete "${modal.exercise.name}"?`}
          message={
            modal.refs > 0
              ? `This exercise is used in ${modal.refs} card(s). Cards will become placeholders.`
              : "This exercise will be permanently deleted."
          }
          confirmLabel="Delete"
          destructive
          loading={deleteMut.isPending}
          error={deleteError}
          onConfirm={() => deleteMut.mutate(modal.exercise.id)}
          onCancel={() => setModal(null)}
        />
      )}
    </div>
  );
}

const rootStyle: React.CSSProperties = {
  display: "flex",
  height: "100%",
  background: BG,
  color: TEXT_PRIMARY,
  overflow: "hidden",
};

const leftPanelStyle: React.CSSProperties = {
  width: 400,
  flexShrink: 0,
  display: "flex",
  flexDirection: "column",
  borderRight: `1px solid ${DIVIDER}`,
  overflow: "hidden",
};

const leftHeaderStyle: React.CSSProperties = {
  padding: "14px 20px 12px",
  flexShrink: 0,
  borderBottom: `1px solid ${DIVIDER}`,
};

const backBtnStyle: React.CSSProperties = {
  background: "rgba(255,255,255,0.09)",
  border: "1px solid rgba(255,255,255,0.14)",
  borderRadius: 8,
  color: "#e5e7eb",
  cursor: "pointer",
  fontSize: 13,
  fontWeight: 500,
  padding: "6px 14px",
  display: "block",
  marginBottom: 10,
};

const pageTitleStyle: React.CSSProperties = {
  fontSize: 34,
  fontWeight: 800,
  margin: "0 0 4px",
  letterSpacing: "-0.02em",
  color: TEXT_PRIMARY,
};

const pageSubtitleStyle: React.CSSProperties = {
  margin: "0 0 14px",
  fontSize: 14,
  color: TEXT_SECONDARY,
};

const toolbarStyle: React.CSSProperties = {
  display: "flex",
  gap: 8,
  alignItems: "center",
};

const searchWrapStyle: React.CSSProperties = {
  flex: 1,
  display: "flex",
  alignItems: "center",
  gap: 8,
  background: CARD,
  border: `1px solid ${BORDER}`,
  borderRadius: 8,
  padding: "6px 10px",
};

const searchIconStyle: React.CSSProperties = {
  fontSize: 16,
  color: TEXT_SECONDARY,
  flexShrink: 0,
};

const searchInputStyle: React.CSSProperties = {
  flex: 1,
  background: "none",
  border: "none",
  outline: "none",
  fontSize: 14,
  color: TEXT_PRIMARY,
};

const newBtnStyle: React.CSSProperties = {
  flexShrink: 0,
  padding: "7px 14px",
  borderRadius: 8,
  border: "none",
  background: "#2d6a3f",
  color: "#fff",
  cursor: "pointer",
  fontSize: 13,
  fontWeight: 600,
  whiteSpace: "nowrap",
};

const listStyle: React.CSSProperties = {
  flex: 1,
  overflowY: "auto",
  padding: "8px 0",
};

const exerciseRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  width: "100%",
  padding: "14px 20px",
  boxSizing: "border-box",
  gap: 12,
  background: "transparent",
  border: "none",
  borderBottom: `1px solid ${DIVIDER}`,
  cursor: "pointer",
  transition: "background 0.1s",
  color: TEXT_PRIMARY,
};

const exNameStyle: React.CSSProperties = {
  fontSize: 16,
  fontWeight: 600,
  color: TEXT_PRIMARY,
  marginBottom: 2,
};

const exNotesStyle: React.CSSProperties = {
  fontSize: 13,
  color: TEXT_SECONDARY,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const chevronStyle: React.CSSProperties = {
  fontSize: 20,
  color: TEXT_SECONDARY,
  flexShrink: 0,
  lineHeight: 1,
};

const listCountStyle: React.CSSProperties = {
  textAlign: "center",
  fontSize: 12,
  color: TEXT_SECONDARY,
  padding: "12px 0",
  margin: 0,
};

const rightPanelStyle: React.CSSProperties = {
  flex: 1,
  background: "#242426",
  overflowY: "auto",
};

const detailRootStyle: React.CSSProperties = {
  padding: "28px 32px",
};

const detailHeaderStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  gap: 16,
  marginBottom: 20,
};

const detailTitleStyle: React.CSSProperties = {
  fontSize: 34,
  fontWeight: 800,
  margin: "0 0 4px",
  letterSpacing: "-0.02em",
  color: TEXT_PRIMARY,
};


const editBtnStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  padding: "7px 14px",
  borderRadius: 8,
  border: `1px solid ${BORDER}`,
  background: CARD,
  color: TEXT_PRIMARY,
  cursor: "pointer",
  fontSize: 13,
  fontWeight: 500,
  whiteSpace: "nowrap",
};

const deleteBtnStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  padding: "7px 14px",
  borderRadius: 8,
  border: "1px solid rgba(239,68,68,0.3)",
  background: "rgba(239,68,68,0.08)",
  color: "#f87171",
  cursor: "pointer",
  fontSize: 13,
  fontWeight: 500,
  whiteSpace: "nowrap",
};

const detailDividerStyle: React.CSSProperties = {
  height: 1,
  background: DIVIDER,
  margin: "0 0 20px",
};

const detailSectionStyle: React.CSSProperties = {
  marginBottom: 24,
};

const sectionHeadingStyle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 700,
  color: TEXT_PRIMARY,
  margin: "0 0 12px",
  letterSpacing: "0.02em",
};

const notesTextStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 15,
  color: TEXT_SECONDARY,
  lineHeight: 1.6,
};

const detailRowsStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 0,
  background: CARD,
  borderRadius: 12,
  border: `1px solid ${BORDER}`,
  overflow: "hidden",
};

const detailRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  padding: "12px 16px",
  borderBottom: `1px solid ${DIVIDER}`,
};

const detailRowIconStyle: React.CSSProperties = {
  fontSize: 16,
  width: 20,
  textAlign: "center",
  flexShrink: 0,
  color: TEXT_SECONDARY,
};

const detailRowLabelStyle: React.CSSProperties = {
  flex: 1,
  fontSize: 14,
  fontWeight: 600,
  color: TEXT_PRIMARY,
};

const detailRowValueStyle: React.CSSProperties = {
  fontSize: 14,
  color: TEXT_SECONDARY,
};

const emptyDetailStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  height: "100%",
  padding: 40,
  textAlign: "center",
};

const overlayStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.6)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 100,
};

const modalStyle: React.CSSProperties = {
  background: CARD,
  borderRadius: 16,
  padding: "24px 24px 20px",
  width: 400,
  boxShadow: "0 8px 40px rgba(0,0,0,0.5)",
  border: `1px solid ${BORDER}`,
};

const modalTitleStyle: React.CSSProperties = {
  margin: "0 0 18px",
  fontSize: 18,
  fontWeight: 700,
  color: TEXT_PRIMARY,
};
