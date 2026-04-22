import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { setTemplatesApi } from "../../api/setTemplates";
import type { SetTemplateCard, CardType, PlaceholderTag } from "../../types/setTemplate";
import { SortableList } from "../../components/SortableList";
import { ConfirmModal } from "../../components/ConfirmModal";
import CardEditor from "./CardEditor";

interface Props {
  setId: string;
  onBack: () => void;
}

type Modal =
  | { type: "add" }
  | { type: "edit"; card: SetTemplateCard }
  | { type: "delete"; card: SetTemplateCard };

export default function SetEditor({ setId, onBack }: Props) {
  const qc = useQueryClient();
  const [modal, setModal] = useState<Modal | null>(null);

  const { data: detail, isLoading } = useQuery({
    queryKey: ["set-template", setId],
    queryFn: () => setTemplatesApi.get(setId),
  });

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

  if (isLoading || !detail) {
    return (
      <div style={pageStyle}>
        <button onClick={onBack} style={backBtnStyle}>← Back</button>
        <p style={{ color: "#6b7280" }}>Loading…</p>
      </div>
    );
  }

  function cardLabel(card: SetTemplateCard) {
    if (card.card_type === "placeholder") {
      return card.placeholder_label ?? card.placeholder_tag ?? "Placeholder";
    }
    return `Exercise card`;
  }

  return (
    <div style={pageStyle}>
      <button onClick={onBack} style={backBtnStyle}>← Sets</button>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>{detail.name}</h2>
        <button onClick={() => setModal({ type: "add" })} style={addBtnStyle}>+ Card</button>
      </div>

      {detail.notes && (
        <p style={{ color: "#6b7280", fontSize: 13, marginBottom: 12 }}>{detail.notes}</p>
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
                  background: card.card_type === "concrete" ? "#dbeafe" : "#fef3c7",
                  color: card.card_type === "concrete" ? "#1d4ed8" : "#92400e",
                  marginRight: 8,
                }}
              >
                {card.card_type}
              </span>
              <span style={{ fontWeight: 500 }}>{cardLabel(card)}</span>
              {card.duration_hint_sec != null && (
                <span style={{ marginLeft: 8, fontSize: 12, color: "#6b7280" }}>
                  {card.duration_hint_sec}s
                </span>
              )}
              {card.notes && (
                <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 2 }}>{card.notes}</div>
              )}
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <button onClick={() => setModal({ type: "edit", card })} style={iconBtnStyle}>Edit</button>
              <button
                onClick={() => setModal({ type: "delete", card })}
                style={{ ...iconBtnStyle, color: "#dc2626" }}
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
        <p style={{ color: "#9ca3af", textAlign: "center", padding: "24px 0" }}>
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
const cardRowStyle: React.CSSProperties = {
  display: "flex", alignItems: "center", padding: "10px 12px",
  background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8, marginBottom: 4,
  cursor: "grab",
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
  padding: "24px 20px", boxShadow: "0 -4px 24px rgba(0,0,0,0.12)", maxHeight: "90vh", overflow: "auto",
};
