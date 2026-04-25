import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { setTemplatesApi } from "../../api/setTemplates";
import { exercisesApi } from "../../api/exercises";
import type { SetTemplateCard, CardType, PlaceholderTag } from "../../types/setTemplate";
import type { Exercise } from "../../types/exercise";
import { SortableList } from "../../components/SortableList";
import { ConfirmModal } from "../../components/ConfirmModal";
import CardEditor from "./CardEditor";
import { tokens } from "../../theme/tokens";

interface Props {
  setId: string;
  onBack: () => void;
}

type Modal =
  | { type: "add" }
  | { type: "edit"; card: SetTemplateCard }
  | { type: "delete"; card: SetTemplateCard }
  | { type: "edit-meta" };

export default function SetEditor({ setId, onBack }: Props) {
  const qc = useQueryClient();
  const [modal, setModal] = useState<Modal | null>(null);
  const [metaName, setMetaName] = useState("");
  const [metaNotes, setMetaNotes] = useState("");

  const { data: detail, isLoading } = useQuery({
    queryKey: ["set-template", setId],
    queryFn: () => setTemplatesApi.get(setId),
  });

  const { data: allExercises = [] } = useQuery({
    queryKey: ["exercises"],
    queryFn: exercisesApi.list,
  });
  const exerciseMap = new Map<string, Exercise>(allExercises.map((e) => [e.id, e]));

  const addCardMut = useMutation({
    mutationFn: (params: {
      cardType: CardType;
      exerciseId: string | null;
      placeholderTag: PlaceholderTag | null;
      placeholderLabel: string | null;
      durationHintSec: number | null;
      notes: string | null;
    }) =>
      setTemplatesApi.addCard({
        setId,
        cardType: params.cardType,
        exerciseId: params.exerciseId,
        placeholderTag: params.placeholderTag,
        placeholderLabel: params.placeholderLabel,
        durationHintSec: params.durationHintSec,
        notes: params.notes,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["set-template", setId] });
      qc.invalidateQueries({ queryKey: ["set-templates"] });
      setModal(null);
    },
  });

  const updateCardMut = useMutation({
    mutationFn: (params: {
      cardId: string;
      exerciseId: string | null;
      placeholderTag: PlaceholderTag | null;
      placeholderLabel: string | null;
      durationHintSec: number | null;
      notes: string | null;
    }) =>
      setTemplatesApi.updateCard({
        cardId: params.cardId,
        exerciseId: params.exerciseId,
        placeholderTag: params.placeholderTag,
        placeholderLabel: params.placeholderLabel,
        durationHintSec: params.durationHintSec,
        notes: params.notes,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["set-template", setId] });
      setModal(null);
    },
  });

  const removeCardMut = useMutation({
    mutationFn: (cardId: string) => setTemplatesApi.removeCard(cardId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["set-template", setId] });
      qc.invalidateQueries({ queryKey: ["set-templates"] });
      setModal(null);
    },
  });

  const reorderMut = useMutation({
    mutationFn: (orderedIds: string[]) => setTemplatesApi.reorderCards(setId, orderedIds),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["set-template", setId] }),
  });

  const updateMetaMut = useMutation({
    mutationFn: (params: { name: string; notes: string | null }) =>
      setTemplatesApi.update(setId, params.name, params.notes),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["set-template", setId] });
      qc.invalidateQueries({ queryKey: ["set-templates"] });
      setModal(null);
    },
  });

  if (isLoading || !detail) {
    return (
      <div style={pageStyle}>
        <button onClick={onBack} style={backBtnStyle}>← Back</button>
        <p style={{ color: tokens.textMuted }}>Loading…</p>
      </div>
    );
  }

  function cardLabel(card: SetTemplateCard) {
    if (card.card_type === "placeholder") {
      return card.placeholder_label ?? card.placeholder_tag ?? "Placeholder";
    }
    // Concrete card: look up exercise name from the live exercise list.
    if (card.exercise_id) {
      const ex = exerciseMap.get(card.exercise_id);
      if (ex) return ex.name;
    }
    return "Unknown exercise";
  }

  return (
    <div style={pageStyle}>
      <button onClick={onBack} style={backBtnStyle}>← Sets</button>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {detail.name}
          </h2>
          <button
            onClick={() => { setMetaName(detail.name); setMetaNotes(detail.notes ?? ""); setModal({ type: "edit-meta" }); }}
            style={editMetaBtnStyle}
            title="Rename / edit set details"
          >
            Edit
          </button>
        </div>
        <button onClick={() => setModal({ type: "add" })} style={addBtnStyle}>+ Card</button>
      </div>

      {detail.notes && (
        <p style={{ color: tokens.textMuted, fontSize: 13, marginBottom: 12 }}>{detail.notes}</p>
      )}

      <SortableList
        items={detail.cards}
        onReorder={(newOrder) => {
          reorderMut.mutate(newOrder.map((c) => c.id));
        }}
        renderItem={(card) => (
          <div style={cardRowStyle}>
            <div style={{ flex: 1 }}>
              <span
                style={{
                  fontSize: 11, fontWeight: 600, padding: "2px 6px", borderRadius: 4,
                  background: card.card_type === "concrete" ? tokens.blueBadgeBg : tokens.amberBadgeBg,
                  color: card.card_type === "concrete" ? tokens.blue : tokens.amber,
                  marginRight: 8,
                }}
              >
                {card.card_type}
              </span>
              <span style={{ fontWeight: 500 }}>{cardLabel(card)}</span>
              {card.duration_hint_sec != null && (
                <span style={{ marginLeft: 8, fontSize: 12, color: tokens.textMuted }}>
                  {card.duration_hint_sec}s
                </span>
              )}
              {card.notes && (
                <div style={{ fontSize: 12, color: tokens.textFaint, marginTop: 2 }}>{card.notes}</div>
              )}
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <button onClick={() => setModal({ type: "edit", card })} style={iconBtnStyle}>Edit</button>
              <button
                onClick={() => setModal({ type: "delete", card })}
                style={{ ...iconBtnStyle, color: tokens.red }}
              >
                ✕
              </button>
            </div>
          </div>
        )}
        renderFallbackControls={(_card, i, total, move) => (
          <div style={{ display: "flex", gap: 4, padding: "4px 12px" }}>
            <button disabled={i === 0} onClick={() => move(i, i - 1)} style={iconBtnStyle}>↑</button>
            <button disabled={i === total - 1} onClick={() => move(i, i + 1)} style={iconBtnStyle}>↓</button>
          </div>
        )}
      />

      {detail.cards.length === 0 && (
        <p style={{ color: tokens.textFaint, textAlign: "center", padding: "24px 0" }}>
          No cards yet — add one above
        </p>
      )}

      {/* Add / Edit modal */}
      {(modal?.type === "add" || modal?.type === "edit") && (
        <div style={overlayStyle}>
          <div style={sheetStyle}>
            <h3 style={{ margin: "0 0 16px" }}>
              {modal.type === "add" ? "Add card" : "Edit card"}
            </h3>
            <CardEditor
              card={modal.type === "edit" ? modal.card : undefined}
              saving={addCardMut.isPending || updateCardMut.isPending}
              onCancel={() => setModal(null)}
              onSave={(values) => {
                if (modal.type === "add") {
                  addCardMut.mutate(values);
                } else {
                  updateCardMut.mutate({ cardId: modal.card.id, ...values });
                }
              }}
            />
          </div>
        </div>
      )}

      {modal?.type === "delete" && (
        <ConfirmModal
          title="Remove card?"
          message="This card will be permanently deleted."
          confirmLabel="Remove"
          destructive
          loading={removeCardMut.isPending}
          onConfirm={() => removeCardMut.mutate(modal.card.id)}
          onCancel={() => setModal(null)}
        />
      )}

      {/* Edit set metadata */}
      {modal?.type === "edit-meta" && (
        <div style={overlayStyle}>
          <div style={sheetStyle}>
            <h3 style={{ margin: "0 0 16px" }}>Edit set details</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div>
                <label style={metaLabelStyle}>Name</label>
                <input
                  autoFocus
                  value={metaName}
                  onChange={(e) => setMetaName(e.target.value)}
                  style={metaInputStyle}
                  placeholder="Set name"
                />
              </div>
              <div>
                <label style={metaLabelStyle}>Notes (optional)</label>
                <textarea
                  value={metaNotes}
                  onChange={(e) => setMetaNotes(e.target.value)}
                  style={{ ...metaInputStyle, minHeight: 72, resize: "vertical" }}
                  placeholder="Optional notes…"
                />
              </div>
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <button
                  onClick={() => setModal(null)}
                  style={metaCancelBtnStyle}
                  disabled={updateMetaMut.isPending}
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    const name = metaName.trim();
                    if (!name) return;
                    updateMetaMut.mutate({ name, notes: metaNotes.trim() || null });
                  }}
                  style={metaSaveBtnStyle}
                  disabled={!metaName.trim() || updateMetaMut.isPending}
                >
                  {updateMetaMut.isPending ? "Saving…" : "Save"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const pageStyle: React.CSSProperties = {
  padding: 16, maxWidth: 600, margin: "0 auto",
  background: tokens.bg, color: tokens.textPrimary, minHeight: "100%", boxSizing: "border-box",
};
const backBtnStyle: React.CSSProperties = {
  background: "none", border: "none", cursor: "pointer",
  color: tokens.textMuted, fontWeight: 500, fontSize: 14, padding: "0 0 12px", display: "block",
};
const addBtnStyle: React.CSSProperties = {
  padding: "6px 14px", borderRadius: 6, border: "none",
  background: tokens.green, color: "#fff", cursor: "pointer", fontWeight: 600,
};
const cardRowStyle: React.CSSProperties = {
  display: "flex", alignItems: "center", padding: "10px 12px",
  background: tokens.card, border: `1px solid ${tokens.borderMedium}`, borderRadius: 8, marginBottom: 4,
  cursor: "grab",
};
const iconBtnStyle: React.CSSProperties = {
  padding: "4px 10px", borderRadius: 5, border: `1px solid ${tokens.borderMedium}`,
  background: tokens.cardSubtle, cursor: "pointer", fontSize: 12, color: tokens.textSecondary,
};
const overlayStyle: React.CSSProperties = {
  position: "fixed", inset: 0, background: tokens.overlay,
  display: "flex", alignItems: "flex-end", zIndex: 100,
};
const sheetStyle: React.CSSProperties = {
  width: "100%", background: tokens.card, borderRadius: "16px 16px 0 0",
  padding: "24px 20px", boxShadow: "0 -4px 24px rgba(0,0,0,0.5)", maxHeight: "90vh", overflow: "auto",
};
const editMetaBtnStyle: React.CSSProperties = {
  padding: "2px 8px", borderRadius: 5, border: `1px solid ${tokens.borderMedium}`,
  background: tokens.cardSubtle, cursor: "pointer", fontSize: 12, color: tokens.textSecondary, flexShrink: 0,
};
const metaLabelStyle: React.CSSProperties = {
  display: "block", fontSize: 13, fontWeight: 500, marginBottom: 4, color: tokens.textSecondary,
};
const metaInputStyle: React.CSSProperties = {
  width: "100%", boxSizing: "border-box", padding: "8px 10px",
  border: `1px solid ${tokens.borderMedium}`, borderRadius: 6, fontSize: 14,
  background: tokens.bg, color: tokens.textPrimary, outline: "none",
};
const metaCancelBtnStyle: React.CSSProperties = {
  padding: "7px 14px", borderRadius: 6, border: `1px solid ${tokens.borderMedium}`,
  background: "transparent", cursor: "pointer", fontSize: 14, color: tokens.textSecondary,
};
const metaSaveBtnStyle: React.CSSProperties = {
  padding: "7px 14px", borderRadius: 6, border: "none",
  background: tokens.green, color: "#fff", cursor: "pointer", fontSize: 14, fontWeight: 600,
};
