import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { workoutTemplatesApi } from "../../api/workoutTemplates";
import { useForm } from "react-hook-form";
import type { WorkoutTemplateSummary } from "../../types/workoutTemplate";
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

export default function WorkoutTemplateBuilder() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [modal, setModal] = useState<Modal | null>(null);

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
      setSelectedId(created.id);
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => workoutTemplatesApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["workout-templates"] });
      setModal(null);
    },
  });

  if (selectedId) {
    return <WorkoutEditor workoutId={selectedId} onBack={() => setSelectedId(null)} />;
  }

  return (
    <div style={pageStyle}>
      <button onClick={() => navigate("/")} style={backBtnStyle}>← Menu</button>
      <div style={headerStyle}>
        <h2 style={titleStyle}>Workouts</h2>
        <button onClick={() => setModal({ type: "create" })} style={addBtnStyle}>+ New</button>
      </div>

      {isLoading && <p style={{ color: "#6b7280" }}>Loading…</p>}

      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {workouts.map((w) => (
          <div key={w.id} style={rowStyle}>
            <div style={{ flex: 1, cursor: "pointer" }} onClick={() => setSelectedId(w.id)}>
              <div style={{ fontWeight: 500 }}>{w.name}</div>
              <div style={{ fontSize: 12, color: "#6b7280" }}>
                {w.set_count} set{w.set_count !== 1 ? "s" : ""}
                {" · "}{w.default_exercise_duration_sec}s default
              </div>
            </div>
            <button
              onClick={() => setModal({ type: "delete", workout: w })}
              style={{ ...iconBtnStyle, color: "#dc2626" }}
            >
              Delete
            </button>
          </div>
        ))}
        {!isLoading && workouts.length === 0 && (
          <p style={{ color: "#9ca3af", textAlign: "center", padding: "24px 0" }}>No workouts yet</p>
        )}
      </div>

      {/* Create modal */}
      {modal?.type === "create" && (
        <div style={overlayStyle}>
          <div style={sheetStyle}>
            <h3 style={{ margin: "0 0 16px" }}>New workout template</h3>
            <form
              onSubmit={handleSubmit((data) => createMut.mutate(data))}
              style={{ display: "flex", flexDirection: "column", gap: 12 }}
            >
              <div>
                <label style={labelStyle}>Name</label>
                <input
                  {...register("name", { required: "Name is required" })}
                  style={inputStyle}
                  placeholder="e.g. Push Day"
                  autoFocus
                />
                {errors.name && <p style={errorStyle}>{errors.name.message}</p>}
              </div>
              <div>
                <label style={labelStyle}>Notes (optional)</label>
                <input {...register("notes")} style={inputStyle} />
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <div style={{ flex: 1 }}>
                  <label style={labelStyle}>Default duration (sec)</label>
                  <input type="number" min={1} {...register("defaultDurationSec")} style={inputStyle} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={labelStyle}>Rest between sets (sec)</label>
                  <input type="number" min={0} {...register("restSec")} style={inputStyle} placeholder="none" />
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
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

const backBtnStyle: React.CSSProperties = {
  background: "none", border: "none", cursor: "pointer", fontSize: 13,
  color: "#6b7280", padding: "0 0 8px", display: "block",
};
const pageStyle: React.CSSProperties = { padding: 16, maxWidth: 600, margin: "0 auto" };
const headerStyle: React.CSSProperties = { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 };
const titleStyle: React.CSSProperties = { margin: 0, fontSize: 20, fontWeight: 700 };
const addBtnStyle: React.CSSProperties = {
  padding: "6px 14px", borderRadius: 6, border: "none",
  background: "#2563eb", color: "#fff", cursor: "pointer", fontWeight: 600,
};
const rowStyle: React.CSSProperties = {
  display: "flex", alignItems: "center", padding: "10px 12px",
  background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8,
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
const labelStyle: React.CSSProperties = { display: "block", fontSize: 13, fontWeight: 500, marginBottom: 4 };
const inputStyle: React.CSSProperties = {
  width: "100%", boxSizing: "border-box", padding: "7px 10px",
  border: "1px solid #d1d5db", borderRadius: 6, fontSize: 14,
};
const errorStyle: React.CSSProperties = { color: "#dc2626", fontSize: 12, marginTop: 4 };
const cancelBtnStyle: React.CSSProperties = {
  padding: "7px 14px", borderRadius: 6, border: "1px solid #d1d5db",
  background: "#f9fafb", cursor: "pointer", fontSize: 14,
};
const saveBtnStyle: React.CSSProperties = {
  padding: "7px 14px", borderRadius: 6, border: "none",
  background: "#2563eb", color: "#fff", cursor: "pointer", fontSize: 14, fontWeight: 600,
};
