import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { exercisesApi } from "../../api/exercises";
import type { Exercise } from "../../types/exercise";
import ExerciseForm from "./ExerciseForm";
import { ConfirmModal } from "../../components/ConfirmModal";

type Modal =
  | { type: "create" }
  | { type: "edit"; exercise: Exercise }
  | { type: "delete"; exercise: Exercise; refs: number };

export default function ExerciseLibrary() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState<Modal | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const { data: exercises = [], isLoading } = useQuery({
    queryKey: ["exercises"],
    queryFn: exercisesApi.list,
  });

  const createMut = useMutation({
    mutationFn: ({ name, notes }: { name: string; notes: string | null }) =>
      exercisesApi.create(name, notes),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["exercises"] }); setModal(null); },
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

  const filtered = exercises.filter((e) =>
    e.name.toLowerCase().includes(search.toLowerCase()),
  );

  async function handleDeleteClick(ex: Exercise) {
    setDeleteError(null);
    const refs = await exercisesApi.getReferences(ex.id);
    setModal({ type: "delete", exercise: ex, refs: refs.cards.length });
  }

  return (
    <div style={pageStyle}>
      <button onClick={() => navigate("/")} style={backBtnStyle}>← Menu</button>
      <div style={headerStyle}>
        <h2 style={titleStyle}>Exercises</h2>
        <button onClick={() => setModal({ type: "create" })} style={addBtnStyle}>
          + New
        </button>
      </div>

      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search…"
        style={searchStyle}
      />

      {isLoading && <p style={{ color: "#6b7280", padding: 16 }}>Loading…</p>}

      <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
        {filtered.map((ex) => (
          <div key={ex.id} style={rowStyle}>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 500 }}>{ex.name}</div>
              {ex.notes && <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>{ex.notes}</div>}
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <button
                onClick={() => setModal({ type: "edit", exercise: ex })}
                style={iconBtnStyle}
              >
                Edit
              </button>
              <button
                onClick={() => handleDeleteClick(ex)}
                style={{ ...iconBtnStyle, color: "#dc2626" }}
              >
                Delete
              </button>
            </div>
          </div>
        ))}
        {!isLoading && filtered.length === 0 && (
          <p style={{ color: "#9ca3af", padding: "16px 0", textAlign: "center" }}>
            {search ? "No matches" : "No exercises yet"}
          </p>
        )}
      </div>

      {/* Create / Edit modal */}
      {(modal?.type === "create" || modal?.type === "edit") && (
        <div style={overlayStyle}>
          <div style={sheetStyle}>
            <h3 style={{ margin: "0 0 16px" }}>
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

const backBtnStyle: React.CSSProperties = {
  background: "none", border: "none", cursor: "pointer", fontSize: 13,
  color: "#6b7280", padding: "0 0 8px", display: "block",
};
const pageStyle: React.CSSProperties = { padding: 16, maxWidth: 600, margin: "0 auto" };
const headerStyle: React.CSSProperties = { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 };
const titleStyle: React.CSSProperties = { margin: 0, fontSize: 20, fontWeight: 700 };
const addBtnStyle: React.CSSProperties = {
  padding: "6px 14px", borderRadius: 6, border: "none",
  background: "#2563eb", color: "#fff", cursor: "pointer", fontWeight: 600,
};
const searchStyle: React.CSSProperties = {
  width: "100%", boxSizing: "border-box", padding: "8px 12px",
  border: "1px solid #d1d5db", borderRadius: 8, fontSize: 14, marginBottom: 12,
};
const rowStyle: React.CSSProperties = {
  display: "flex", alignItems: "center", padding: "10px 12px",
  background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8, marginBottom: 4,
};
const iconBtnStyle: React.CSSProperties = {
  padding: "4px 10px", borderRadius: 5, border: "1px solid #e5e7eb",
  background: "#f9fafb", cursor: "pointer", fontSize: 12,
};
const overlayStyle: React.CSSProperties = {
  position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)",
  display: "flex", alignItems: "flex-end", zIndex: 100,
};
const sheetStyle: React.CSSProperties = {
  width: "100%", background: "#fff", borderRadius: "16px 16px 0 0",
  padding: "24px 20px", boxShadow: "0 -4px 24px rgba(0,0,0,0.12)",
};
