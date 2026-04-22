import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { setTemplatesApi } from "../../api/setTemplates";
import type { SetTemplateSummary } from "../../types/setTemplate";
import { ConfirmModal } from "../../components/ConfirmModal";
import SetEditor from "./SetEditor";

type Modal =
  | { type: "create" }
  | { type: "delete"; set: SetTemplateSummary };

export default function SetTemplateBuilder() {
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [modal, setModal] = useState<Modal | null>(null);
  const [newName, setNewName] = useState("");

  const { data: sets = [], isLoading } = useQuery({
    queryKey: ["set-templates"],
    queryFn: setTemplatesApi.list,
  });

  const createMut = useMutation({
    mutationFn: (name: string) => setTemplatesApi.create(name, null),
    onSuccess: (created) => {
      qc.invalidateQueries({ queryKey: ["set-templates"] });
      setModal(null);
      setNewName("");
      setSelectedId(created.id);
    },
  });

  const cloneMut = useMutation({
    mutationFn: (id: string) => setTemplatesApi.clone(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["set-templates"] }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => setTemplatesApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["set-templates"] });
      setModal(null);
    },
  });

  if (selectedId) {
    return <SetEditor setId={selectedId} onBack={() => setSelectedId(null)} />;
  }

  return (
    <div style={pageStyle}>
      <div style={headerStyle}>
        <h2 style={titleStyle}>Sets</h2>
        <button onClick={() => setModal({ type: "create" })} style={addBtnStyle}>+ New</button>
      </div>

      {isLoading && <p style={{ color: "#6b7280" }}>Loading…</p>}

      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {sets.map((s) => (
          <div key={s.id} style={rowStyle}>
            <div style={{ flex: 1, cursor: "pointer" }} onClick={() => setSelectedId(s.id)}>
              <div style={{ fontWeight: 500 }}>{s.name}</div>
              <div style={{ fontSize: 12, color: "#6b7280" }}>{s.card_count} card{s.card_count !== 1 ? "s" : ""}</div>
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <button
                onClick={() => cloneMut.mutate(s.id)}
                style={iconBtnStyle}
                disabled={cloneMut.isPending}
              >
                Clone
              </button>
              <button
                onClick={() => setModal({ type: "delete", set: s })}
                style={{ ...iconBtnStyle, color: "#dc2626" }}
              >
                Delete
              </button>
            </div>
          </div>
        ))}
        {!isLoading && sets.length === 0 && (
          <p style={{ color: "#9ca3af", textAlign: "center", padding: "24px 0" }}>No sets yet</p>
        )}
      </div>

      {/* Create modal */}
      {modal?.type === "create" && (
        <div style={overlayStyle}>
          <div style={sheetStyle}>
            <h3 style={{ margin: "0 0 16px" }}>New set template</h3>
            <label style={labelStyle}>Name</label>
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              style={inputStyle}
              placeholder="e.g. Push A"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter" && newName.trim()) createMut.mutate(newName.trim());
              }}
            />
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16 }}>
              <button onClick={() => { setModal(null); setNewName(""); }} style={cancelBtnStyle}>
                Cancel
              </button>
              <button
                onClick={() => { if (newName.trim()) createMut.mutate(newName.trim()); }}
                style={saveBtnStyle}
                disabled={!newName.trim() || createMut.isPending}
              >
                {createMut.isPending ? "Creating…" : "Create"}
              </button>
            </div>
          </div>
        </div>
      )}

      {modal?.type === "delete" && (
        <ConfirmModal
          title={`Delete "${modal.set.name}"?`}
          message={
            modal.set.card_count > 0
              ? `This set has ${modal.set.card_count} card(s). All data will be lost.`
              : "This set template will be permanently deleted."
          }
          confirmLabel="Delete"
          destructive
          loading={deleteMut.isPending}
          onConfirm={() => deleteMut.mutate(modal.set.id)}
          onCancel={() => setModal(null)}
        />
      )}
    </div>
  );
}

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
  width: "100%", boxSizing: "border-box", padding: "8px 10px",
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
