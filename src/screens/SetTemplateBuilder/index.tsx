import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { setTemplatesApi } from "../../api/setTemplates";
import { exercisesApi } from "../../api/exercises";
import type { SetTemplateSummary, SetTemplateCard, CardType, PlaceholderTag } from "../../types/setTemplate";
import type { Exercise } from "../../types/exercise";
import { SortableList } from "../../components/SortableList";
import { ConfirmModal } from "../../components/ConfirmModal";
import CardEditor from "./CardEditor";

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDateShort(s: string): string {
  return new Date(s).toLocaleDateString(undefined, {
    month: "short", day: "numeric", year: "numeric",
  });
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SummaryTile({ icon, label, value }: { icon: string; label: string; value: number }) {
  return (
    <div style={summaryTileStyle}>
      <span style={{ fontSize: 22, color: TEXT_SECONDARY }}>{icon}</span>
      <p style={{ margin: 0, fontSize: 26, fontWeight: 700, color: TEXT_PRIMARY, lineHeight: 1 }}>{value}</p>
      <p style={{ margin: "3px 0 0", fontSize: 11, color: TEXT_MUTED, textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 }}>{label}</p>
    </div>
  );
}

function SetCard({ s, selected, onSelect }: { s: SetTemplateSummary; selected: boolean; onSelect: () => void }) {
  return (
    <div onClick={onSelect} style={setCardStyle(selected)}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={setCardNameStyle}>{s.name}</p>
        <p style={setCardMetaStyle}>
          {s.card_count} card{s.card_count !== 1 ? "s" : ""} · {formatDateShort(s.updated_at)}
        </p>
        {s.notes && <p style={setCardNotesStyle}>{s.notes}</p>}
      </div>
      <span style={{ fontSize: 18, color: TEXT_DISABLED, marginLeft: 10, flexShrink: 0 }}>›</span>
    </div>
  );
}

// ── Right pane ────────────────────────────────────────────────────────────────

type DetailModal =
  | { type: "edit-meta" }
  | { type: "add-card" }
  | { type: "edit-card"; card: SetTemplateCard }
  | { type: "delete-card"; card: SetTemplateCard }
  | { type: "delete-set" };

function SetDetailPane({ setId, onDeleted }: { setId: string; onDeleted: () => void }) {
  const qc = useQueryClient();
  const [modal, setModal] = useState<DetailModal | null>(null);
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

  const cloneMut = useMutation({
    mutationFn: () => setTemplatesApi.clone(setId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["set-templates"] }),
  });

  const deleteMut = useMutation({
    mutationFn: () => setTemplatesApi.delete(setId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["set-templates"] });
      setModal(null);
      onDeleted();
    },
  });

  const updateMetaMut = useMutation({
    mutationFn: (p: { name: string; notes: string | null }) =>
      setTemplatesApi.update(setId, p.name, p.notes),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["set-template", setId] });
      qc.invalidateQueries({ queryKey: ["set-templates"] });
      setModal(null);
    },
  });

  const addCardMut = useMutation({
    mutationFn: (p: { cardType: CardType; exerciseId: string | null; placeholderTag: PlaceholderTag | null; placeholderLabel: string | null; durationHintSec: number | null; notes: string | null }) =>
      setTemplatesApi.addCard({ setId, ...p }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["set-template", setId] });
      qc.invalidateQueries({ queryKey: ["set-templates"] });
      setModal(null);
    },
  });

  const updateCardMut = useMutation({
    mutationFn: (p: { cardId: string; exerciseId: string | null; placeholderTag: PlaceholderTag | null; placeholderLabel: string | null; durationHintSec: number | null; notes: string | null }) =>
      setTemplatesApi.updateCard(p),
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

  function cardLabel(card: SetTemplateCard): string {
    if (card.card_type === "placeholder") {
      return card.placeholder_label ?? card.placeholder_tag ?? "Placeholder";
    }
    if (card.exercise_id) {
      const ex = exerciseMap.get(card.exercise_id);
      if (ex) return ex.name;
    }
    return "Unknown exercise";
  }

  if (isLoading || !detail) {
    return <p style={{ color: TEXT_MUTED, padding: 40 }}>Loading…</p>;
  }

  const concreteCount = detail.cards.filter((c) => c.card_type === "concrete").length;
  const placeholderCount = detail.cards.filter((c) => c.card_type === "placeholder").length;

  return (
    <div style={detailPaneStyle}>

      {/* ── Fixed top: header + meta + cards section header ── */}
      <div style={detailFixedTopStyle}>
        <div style={detailHeaderRow}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={initialBoxStyle}>{detail.name.charAt(0).toUpperCase()}</div>
            <h2 style={detailNameStyle}>{detail.name}</h2>
            <button
              onClick={() => { setMetaName(detail.name); setMetaNotes(detail.notes ?? ""); setModal({ type: "edit-meta" }); }}
              style={editPillBtnStyle}
            >
              ✏ Edit
            </button>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => cloneMut.mutate()} disabled={cloneMut.isPending} style={headerActionBtnStyle}>
              ⎘ Clone
            </button>
            <button onClick={() => setModal({ type: "delete-set" })} style={{ ...headerActionBtnStyle, ...deleteHeaderBtnStyle }}>
              Delete
            </button>
          </div>
        </div>

        <p style={detailMetaStyle}>
          {detail.cards.length} card{detail.cards.length !== 1 ? "s" : ""}
          {" · "}Created {formatDateShort(detail.created_at)}
          {" · "}Updated {formatDateShort(detail.updated_at)}
        </p>
        {detail.notes && <p style={detailNotesStyle}>{detail.notes}</p>}

        <div style={dividerStyle} />

        <div style={sectionHeaderRow}>
          <p style={sectionLabelStyle}>Set Cards</p>
          <button onClick={() => setModal({ type: "add-card" })} style={addCardBtnStyle}>+ Add Card</button>
        </div>
      </div>

      {/* ── Scrollable middle: card list only ── */}
      <div style={detailCardListStyle}>
        {detail.cards.length === 0 && (
          <p style={{ color: TEXT_DISABLED, fontSize: 13, padding: "16px 0" }}>No cards yet — add one above.</p>
        )}

        <SortableList
          items={detail.cards}
          onReorder={(newOrder) => reorderMut.mutate(newOrder.map((c) => c.id))}
          renderItem={(card, i) => (
            <div style={cardRowStyle}>
              <span style={dragHandleStyle}>⠿</span>
              <span style={cardNumStyle}>{i + 1}</span>
              <span style={cardTypeBadgeStyle(card.card_type)}>
                {card.card_type === "concrete" ? "CONCRETE" : "PLACEHOLDER"}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={cardNameStyle}>{cardLabel(card)}</p>
                {card.notes && <p style={cardNotesStyle}>{card.notes}</p>}
              </div>
              {card.duration_hint_sec != null && (
                <span style={cardDurStyle}>{card.duration_hint_sec}s</span>
              )}
              <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                <button onClick={() => setModal({ type: "edit-card", card })} style={cardActionBtnStyle}>Edit</button>
                <button onClick={() => setModal({ type: "delete-card", card })} style={{ ...cardActionBtnStyle, color: tokens.red }}>✕</button>
              </div>
            </div>
          )}
          renderFallbackControls={(_card, i, total, move) => (
            <div style={{ display: "flex", gap: 4, padding: "4px 16px" }}>
              <button disabled={i === 0} onClick={() => move(i, i - 1)} style={cardActionBtnStyle}>↑</button>
              <button disabled={i === total - 1} onClick={() => move(i, i + 1)} style={cardActionBtnStyle}>↓</button>
            </div>
          )}
        />
      </div>

      {/* ── Fixed bottom: summary ── */}
      <div style={detailFixedBottomStyle}>
        <div style={dividerStyle} />
        <p style={sectionLabelStyle}>Set Summary</p>
        <div style={summaryRowStyle}>
          <SummaryTile icon="▣" label="Total cards" value={detail.cards.length} />
          <SummaryTile icon="▦" label="Concrete cards" value={concreteCount} />
          <SummaryTile icon="▨" label="Placeholders" value={placeholderCount} />
        </div>
        <p style={footerNoteStyle}>Cards can be reordered using drag &amp; drop.</p>
      </div>

      {/* ── Modals ── */}

      {modal?.type === "edit-meta" && (
        <div style={overlayStyle}>
          <div style={modalStyle}>
            <h3 style={modalTitleStyle}>Edit set details</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div>
                <label style={modalLabelStyle}>Name</label>
                <input autoFocus value={metaName} onChange={(e) => setMetaName(e.target.value)} style={modalInputStyle} placeholder="Set name" />
              </div>
              <div>
                <label style={modalLabelStyle}>Notes (optional)</label>
                <textarea value={metaNotes} onChange={(e) => setMetaNotes(e.target.value)} style={{ ...modalInputStyle, minHeight: 72, resize: "vertical" }} placeholder="Optional notes…" />
              </div>
              <div style={modalFooterRow}>
                <button onClick={() => setModal(null)} style={modalCancelBtnStyle} disabled={updateMetaMut.isPending}>Cancel</button>
                <button
                  onClick={() => { const n = metaName.trim(); if (n) updateMetaMut.mutate({ name: n, notes: metaNotes.trim() || null }); }}
                  style={modalSaveBtnStyle}
                  disabled={!metaName.trim() || updateMetaMut.isPending}
                >
                  {updateMetaMut.isPending ? "Saving…" : "Save"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {(modal?.type === "add-card" || modal?.type === "edit-card") && (
        <div style={overlayStyle}>
          <div style={{ ...modalStyle, maxWidth: 520 }}>
            <h3 style={modalTitleStyle}>{modal.type === "add-card" ? "Add card" : "Edit card"}</h3>
            <CardEditor
              card={modal.type === "edit-card" ? modal.card : undefined}
              saving={addCardMut.isPending || updateCardMut.isPending}
              onCancel={() => setModal(null)}
              onSave={(values) => {
                if (modal.type === "add-card") {
                  addCardMut.mutate(values);
                } else {
                  updateCardMut.mutate({ cardId: modal.card.id, ...values });
                }
              }}
            />
          </div>
        </div>
      )}

      {modal?.type === "delete-card" && (
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

      {modal?.type === "delete-set" && (
        <ConfirmModal
          title={`Delete "${detail.name}"?`}
          message={
            detail.cards.length > 0
              ? `This set has ${detail.cards.length} card(s). All data will be lost.`
              : "This set template will be permanently deleted."
          }
          confirmLabel="Delete"
          destructive
          loading={deleteMut.isPending}
          onConfirm={() => deleteMut.mutate()}
          onCancel={() => setModal(null)}
        />
      )}
    </div>
  );
}

// ── Page root ─────────────────────────────────────────────────────────────────

export default function SetTemplateBuilder() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [search, setSearch] = useState("");

  const { data: sets = [], isLoading } = useQuery({
    queryKey: ["set-templates"],
    queryFn: setTemplatesApi.list,
  });

  const createMut = useMutation({
    mutationFn: (name: string) => setTemplatesApi.create(name, null),
    onSuccess: (created) => {
      qc.invalidateQueries({ queryKey: ["set-templates"] });
      setShowCreate(false);
      setNewName("");
      setSelectedId(created.id);
    },
  });

  useEffect(() => {
    if (sets.length > 0 && !selectedId) {
      setSelectedId(sets[0].id);
    } else if (selectedId && !sets.find((s) => s.id === selectedId)) {
      setSelectedId(sets.length > 0 ? sets[0].id : null);
    }
  }, [sets, selectedId]);

  const filtered = search.trim()
    ? sets.filter((s) => s.name.toLowerCase().includes(search.toLowerCase()))
    : sets;

  return (
    <div style={rootStyle}>
      {/* ── Left panel ── */}
      <div style={leftPanelStyle}>
        <div style={leftHeaderStyle}>
          <button onClick={() => navigate("/")} style={backBtnStyle}>← Back</button>
          <h1 style={pageTitleStyle}>Sets</h1>
          <p style={pageSubtitleStyle}>Create and manage your set templates.</p>
          <div style={searchRowStyle}>
            <div style={searchWrapStyle}>
              <span style={{ fontSize: 16, color: TEXT_MUTED, flexShrink: 0 }}>⌕</span>
              <input
                type="text"
                placeholder="Search sets…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={searchInputStyle}
              />
            </div>
            <button onClick={() => setShowCreate(true)} style={newSetBtnStyle}>+ New Set</button>
          </div>
        </div>

        <div style={listStyle}>
          {isLoading && <p style={{ color: TEXT_MUTED, padding: "16px 20px" }}>Loading…</p>}
          {!isLoading && filtered.length === 0 && (
            <p style={{ color: TEXT_MUTED, padding: "32px 20px", textAlign: "center" }}>
              {search ? "No matching sets." : "No sets yet."}
            </p>
          )}
          {filtered.map((s) => (
            <SetCard key={s.id} s={s} selected={s.id === selectedId} onSelect={() => setSelectedId(s.id)} />
          ))}
          {!isLoading && sets.length > 0 && (
            <p style={countStyle}>{sets.length} set{sets.length !== 1 ? "s" : ""}</p>
          )}
        </div>
      </div>

      {/* ── Right panel ── */}
      <div style={rightPanelStyle}>
        {selectedId ? (
          <SetDetailPane key={selectedId} setId={selectedId} onDeleted={() => setSelectedId(null)} />
        ) : (
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <p style={{ color: TEXT_DISABLED, fontSize: 14 }}>Select a set to view details.</p>
          </div>
        )}
      </div>

      {/* Create modal */}
      {showCreate && (
        <div style={overlayStyle}>
          <div style={modalStyle}>
            <h3 style={modalTitleStyle}>New set template</h3>
            <label style={modalLabelStyle}>Name</label>
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              style={modalInputStyle}
              placeholder="e.g. Push A"
              autoFocus
              onKeyDown={(e) => { if (e.key === "Enter" && newName.trim()) createMut.mutate(newName.trim()); }}
            />
            <div style={{ ...modalFooterRow, marginTop: 16 }}>
              <button onClick={() => { setShowCreate(false); setNewName(""); }} style={modalCancelBtnStyle}>Cancel</button>
              <button
                onClick={() => { if (newName.trim()) createMut.mutate(newName.trim()); }}
                style={modalSaveBtnStyle}
                disabled={!newName.trim() || createMut.isPending}
              >
                {createMut.isPending ? "Creating…" : "Create"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

// Runner palette tokens
import { tokens } from "../../theme/tokens";
const { bg: BG, card: CARD, borderSubtle: CARD_BORDER, textPrimary: TEXT_PRIMARY, textSecondary: TEXT_SECONDARY, textMuted: TEXT_MUTED, divider: DIVIDER } = tokens;
const { bgElevated: BG_ELEVATED, textDisabled: TEXT_DISABLED, textLight: TEXT_LIGHT, surfaceSelected: SURFACE_SELECTED, overlay: OVERLAY } = tokens;
const { surfaceActive: SURFACE_ACTIVE, borderStrong: BORDER_STRONG, borderMedium: BORDER_MEDIUM, green: GREEN, red: RED, redBorder: RED_BORDER, blueBadgeBg: BLUE_BADGE_BG, blueBadgeBorder: BLUE_BADGE_BORDER, blue: BLUE, amberBadgeBg: AMBER_BADGE_BG, amberBadgeBorder: AMBER_BADGE_BORDER, amber: AMBER } = tokens;

const rootStyle: React.CSSProperties = {
  display: "flex",
  height: "100%",
  background: BG,
  color: TEXT_PRIMARY,
  overflow: "hidden",
};

const leftPanelStyle: React.CSSProperties = {
  width: "var(--left-panel-w)",
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
  background: SURFACE_ACTIVE,
  border: `1px solid ${BORDER_STRONG}`,
  borderRadius: 8,
  color: TEXT_LIGHT,
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
  fontSize: 13,
  color: TEXT_MUTED,
  margin: "0 0 14px",
};

const searchRowStyle: React.CSSProperties = {
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
  border: `1px solid ${CARD_BORDER}`,
  borderRadius: 10,
  padding: "8px 12px",
  minWidth: 0,
  overflow: "hidden",
};

const searchInputStyle: React.CSSProperties = {
  flex: 1,
  background: "none",
  border: "none",
  outline: "none",
  fontSize: 14,
  color: TEXT_PRIMARY,
  minWidth: 0,
};

const newSetBtnStyle: React.CSSProperties = {
  padding: "8px 14px",
  borderRadius: 10,
  border: "none",
  background: GREEN,
  color: "#fff",
  cursor: "pointer",
  fontWeight: 600,
  fontSize: 13,
  flexShrink: 0,
};

const listStyle: React.CSSProperties = {
  flex: 1,
  overflowY: "auto",
  padding: "8px 0",
};

const countStyle: React.CSSProperties = {
  textAlign: "center",
  fontSize: 12,
  color: TEXT_DISABLED,
  padding: "12px 0 16px",
};

function setCardStyle(selected: boolean): React.CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    padding: "14px 20px",
    cursor: "pointer",
    background: selected ? SURFACE_SELECTED : "transparent",
    boxShadow: selected ? `inset 3px 0 0 ${tokens.greenBadgeText}` : "none",
    borderBottom: `1px solid ${DIVIDER}`,
    transition: "background 0.1s",
  };
}

const setCardNameStyle: React.CSSProperties = {
  margin: 0,
  fontWeight: 700,
  fontSize: 16,
  color: TEXT_PRIMARY,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const setCardMetaStyle: React.CSSProperties = {
  margin: "3px 0 0",
  fontSize: 12,
  color: TEXT_MUTED,
};

const setCardNotesStyle: React.CSSProperties = {
  margin: "4px 0 0",
  fontSize: 12,
  color: TEXT_DISABLED,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

// Right panel

const rightPanelStyle: React.CSSProperties = {
  flex: 1,
  display: "flex",
  flexDirection: "column",
  overflow: "hidden",
  background: BG_ELEVATED,
};

// Right pane: three-section layout so only the card list scrolls.
const detailPaneStyle: React.CSSProperties = {
  flex: 1,
  display: "flex",
  flexDirection: "column",
  overflow: "hidden",
  minHeight: 0,
};

const detailFixedTopStyle: React.CSSProperties = {
  flexShrink: 0,
  padding: "var(--detail-fixed-top-pad)",
};

const detailCardListStyle: React.CSSProperties = {
  flex: 1,
  overflowY: "auto",
  minHeight: 0,
  padding: "4px 32px 8px",
};

const detailFixedBottomStyle = {
  flexShrink: 0,
  padding: "0 32px 32px",
  display: "var(--detail-fixed-bot-display, block)",
} as React.CSSProperties;

const detailHeaderRow: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  marginBottom: 10,
  flexWrap: "wrap",
  gap: 12,
};

const initialBoxStyle: React.CSSProperties = {
  width: 48,
  height: 48,
  borderRadius: 12,
  background: CARD,
  border: `1px solid ${BORDER_MEDIUM}`,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: 22,
  fontWeight: 700,
  color: TEXT_PRIMARY,
  flexShrink: 0,
};

const detailNameStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 24,
  fontWeight: 800,
  color: TEXT_PRIMARY,
  letterSpacing: "-0.02em",
};

const editPillBtnStyle: React.CSSProperties = {
  padding: "4px 12px",
  borderRadius: 20,
  border: `1px solid ${BORDER_STRONG}`,
  background: CARD,
  color: TEXT_SECONDARY,
  cursor: "pointer",
  fontSize: 12,
  fontWeight: 600,
};

const headerActionBtnStyle: React.CSSProperties = {
  padding: "6px 14px",
  borderRadius: 8,
  border: `1px solid ${BORDER_MEDIUM}`,
  background: "transparent",
  color: TEXT_SECONDARY,
  cursor: "pointer",
  fontSize: 13,
  fontWeight: 500,
};

const deleteHeaderBtnStyle: React.CSSProperties = {
  color: RED,
  borderColor: RED_BORDER,
};

const detailMetaStyle: React.CSSProperties = {
  margin: "0 0 8px",
  fontSize: 13,
  color: TEXT_MUTED,
};

const detailNotesStyle: React.CSSProperties = {
  margin: "0 0 8px",
  fontSize: 14,
  color: TEXT_SECONDARY,
};

const dividerStyle: React.CSSProperties = {
  borderTop: `1px solid ${DIVIDER}`,
  margin: "var(--detail-divider-margin)",
};

const sectionHeaderRow: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  marginBottom: 12,
};

const sectionLabelStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 13,
  fontWeight: 700,
  color: TEXT_SECONDARY,
  letterSpacing: "0.01em",
};

const addCardBtnStyle: React.CSSProperties = {
  padding: "6px 14px",
  borderRadius: 8,
  border: `1px solid ${BORDER_MEDIUM}`,
  background: CARD,
  color: TEXT_PRIMARY,
  cursor: "pointer",
  fontSize: 13,
  fontWeight: 600,
};

// Card rows

const cardRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  padding: "12px 14px",
  background: CARD,
  border: `1px solid ${CARD_BORDER}`,
  borderRadius: 10,
  marginBottom: 6,
  cursor: "grab",
};

const dragHandleStyle: React.CSSProperties = {
  fontSize: 16,
  color: TEXT_DISABLED,
  cursor: "grab",
  flexShrink: 0,
};

const cardNumStyle: React.CSSProperties = {
  fontSize: 13,
  color: TEXT_MUTED,
  minWidth: 18,
  textAlign: "right",
  flexShrink: 0,
};

function cardTypeBadgeStyle(type: "concrete" | "placeholder"): React.CSSProperties {
  const isConcrete = type === "concrete";
  return {
    fontSize: 10,
    fontWeight: 700,
    padding: "3px 7px",
    borderRadius: 5,
    flexShrink: 0,
    letterSpacing: "0.04em",
    background: isConcrete ? BLUE_BADGE_BG : AMBER_BADGE_BG,
    color: isConcrete ? BLUE : AMBER,
    border: isConcrete ? `1px solid ${BLUE_BADGE_BORDER}` : `1px solid ${AMBER_BADGE_BORDER}`,
  };
}

const cardNameStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 14,
  fontWeight: 600,
  color: TEXT_PRIMARY,
};

const cardNotesStyle: React.CSSProperties = {
  margin: "2px 0 0",
  fontSize: 12,
  color: TEXT_MUTED,
};

const cardDurStyle: React.CSSProperties = {
  fontSize: 13,
  color: TEXT_MUTED,
  flexShrink: 0,
  fontVariantNumeric: "tabular-nums",
};

const cardActionBtnStyle: React.CSSProperties = {
  padding: "4px 10px",
  borderRadius: 6,
  border: `1px solid ${BORDER_MEDIUM}`,
  background: "transparent",
  color: TEXT_SECONDARY,
  cursor: "pointer",
  fontSize: 12,
};

// Summary

const summaryRowStyle: React.CSSProperties = {
  display: "flex",
  gap: 12,
  marginTop: 10,
};

const summaryTileStyle: React.CSSProperties = {
  flex: 1,
  display: "flex",
  flexDirection: "column",
  alignItems: "flex-start",
  gap: 4,
  background: CARD,
  border: `1px solid ${CARD_BORDER}`,
  borderRadius: 12,
  padding: "14px 16px",
};

const footerNoteStyle: React.CSSProperties = {
  margin: "20px 0 0",
  fontSize: 12,
  color: TEXT_DISABLED,
  fontStyle: "italic",
  textAlign: "center",
};

// Modals

const overlayStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: OVERLAY,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 100,
};

const modalStyle: React.CSSProperties = {
  background: CARD,
  border: `1px solid ${BORDER_MEDIUM}`,
  borderRadius: 14,
  padding: "24px 24px 20px",
  width: "calc(100% - 64px)",
  maxWidth: 440,
  maxHeight: "85vh",
  overflowY: "auto",
};

const modalTitleStyle: React.CSSProperties = {
  margin: "0 0 16px",
  fontSize: 17,
  fontWeight: 700,
  color: TEXT_PRIMARY,
};

const modalLabelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 13,
  fontWeight: 500,
  color: TEXT_SECONDARY,
  marginBottom: 5,
};

const modalInputStyle: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  padding: "8px 10px",
  border: `1px solid ${BORDER_MEDIUM}`,
  borderRadius: 8,
  fontSize: 14,
  background: BG,
  color: TEXT_PRIMARY,
  outline: "none",
};

const modalFooterRow: React.CSSProperties = {
  display: "flex",
  gap: 8,
  justifyContent: "flex-end",
};

const modalCancelBtnStyle: React.CSSProperties = {
  padding: "8px 16px",
  borderRadius: 8,
  border: `1px solid ${BORDER_MEDIUM}`,
  background: "transparent",
  color: TEXT_SECONDARY,
  cursor: "pointer",
  fontSize: 14,
};

const modalSaveBtnStyle: React.CSSProperties = {
  padding: "8px 16px",
  borderRadius: 8,
  border: "none",
  background: GREEN,
  color: "#fff",
  cursor: "pointer",
  fontSize: 14,
  fontWeight: 600,
};
