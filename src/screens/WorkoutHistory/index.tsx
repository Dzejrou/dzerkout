import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { historyApi } from "../../api/history";
import type { SessionDetail, SessionDetailSet, SessionSummary } from "../../types/session";
import type { WorkoutSessionExerciseRow } from "../../types/session";

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDurationSec(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0)
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function elapsedSec(startedAt: string | null, endedAt: string | null): number | null {
  if (!startedAt || !endedAt) return null;
  return Math.round((new Date(endedAt).getTime() - new Date(startedAt).getTime()) / 1000);
}

function formatDateFull(s: string | null): string {
  if (!s) return "—";
  const d = new Date(s);
  return (
    d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) +
    " at " +
    d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
  );
}

function formatDateShort(s: string | null): string {
  if (!s) return "—";
  return new Date(s).toLocaleDateString(undefined, {
    month: "short", day: "numeric", year: "numeric",
  });
}

// ── StatusBadge ───────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const label =
    status === "completed" ? "Completed" :
    status === "in_progress" ? "In Progress" :
    status === "abandoned" ? "Abandoned" : status;

  const style: React.CSSProperties =
    status === "completed"   ? { background: "rgba(34,197,94,0.12)", color: "#4ade80", border: "1px solid rgba(34,197,94,0.2)" } :
    status === "in_progress" ? { background: "rgba(245,158,11,0.12)", color: "#f59e0b", border: "1px solid rgba(245,158,11,0.2)" } :
                               { background: "rgba(239,68,68,0.12)", color: "#f87171", border: "1px solid rgba(239,68,68,0.2)" };

  return (
    <span style={{ ...badgeBaseStyle, ...style }}>{label}</span>
  );
}

// ── Left panel: session list ──────────────────────────────────────────────────

function SessionCard({
  s, selected, onSelect,
}: { s: SessionSummary; selected: boolean; onSelect: () => void }) {
  const dur = elapsedSec(s.started_at, s.ended_at);
  return (
    <div onClick={onSelect} style={sessionCardStyle(selected)}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={cardNameStyle}>{s.source_workout_template_name ?? "Workout"}</p>
        <p style={cardMetaStyle}>
          {formatDateShort(s.session_date ?? s.started_at)}
          {" · "}
          {s.set_count} set{s.set_count !== 1 ? "s" : ""}
          {dur != null && ` · ${formatDurationSec(dur)}`}
        </p>
        <div style={{ marginTop: 6 }}>
          <StatusBadge status={s.status} />
        </div>
      </div>
      <span style={cardChevronStyle}>›</span>
    </div>
  );
}

// ── Right panel: detail pane ──────────────────────────────────────────────────

function StatTile({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div style={statTileStyle}>
      <span style={statIconStyle}>{icon}</span>
      <div>
        <p style={statLabelStyle}>{label}</p>
        <p style={statValueStyle}>{value}</p>
      </div>
    </div>
  );
}

function ExerciseRow({ ex, index }: { ex: WorkoutSessionExerciseRow; index: number }) {
  const isSkipped = ex.status === "skipped";
  const isCompleted = ex.status === "completed";
  const isPlaceholder = ex.placeholder_tag != null;

  return (
    <div style={exRowStyle(isSkipped)}>
      <span style={exNumStyle}>{index + 1}</span>
      <span style={exNameStyle(isSkipped)}>{ex.display_name}</span>
      {isPlaceholder ? (
        <span style={tagStyle(false)}>Placeholder</span>
      ) : (
        <span style={tagStyle(true)}>Concrete</span>
      )}
      <span style={exDurStyle}>
        {ex.performed_duration_sec != null ? formatDurationSec(ex.performed_duration_sec) : "—"}
      </span>
      <span style={{ fontSize: 14, color: isCompleted ? "#4ade80" : isSkipped ? "#6b7280" : "#3a3a3c", minWidth: 18, textAlign: "center" }}>
        {isCompleted ? "✓" : isSkipped ? "—" : ""}
      </span>
    </div>
  );
}

function SetBlock({ set, index }: { set: SessionDetailSet; index: number }) {
  const dur = elapsedSec(set.started_at, set.ended_at);
  const netSec = dur !== null ? Math.max(0, dur - set.paused_total_sec) : null;
  const allDone = set.exercises.every((e) => e.status === "completed" || e.status === "skipped");

  return (
    <div style={setBlockStyle}>
      <div style={setHeaderRow}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={setTitleSpan}>Set {index + 1}</span>
          {netSec !== null && (
            <span style={{ fontSize: 13, color: "#6b7280" }}>• {formatDurationSec(netSec)}</span>
          )}
        </div>
        {allDone && <StatusBadge status="completed" />}
      </div>

      {set.exercises.map((ex, ei) => (
        <ExerciseRow key={ex.id} ex={ex} index={ei} />
      ))}
    </div>
  );
}

function DetailPane({ id }: { id: string }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["session-detail", id],
    queryFn: () => historyApi.getDetail(id),
  });

  if (isLoading) return <p style={detailPlaceholderStyle}>Loading…</p>;
  if (error || !data) return <p style={{ ...detailPlaceholderStyle, color: "#f87171" }}>Failed to load session.</p>;

  const d = data as SessionDetail;
  const totalSec = elapsedSec(d.started_at, d.ended_at);
  const totalExercises = d.sets.reduce((acc, s) => acc + s.exercises.length, 0);

  return (
    <div style={detailScrollStyle}>
      {/* Header */}
      <h2 style={detailTitleStyle}>{d.source_workout_template_name ?? "Workout"}</h2>
      <p style={detailDateStyle}>{formatDateFull(d.session_date ?? d.started_at)}</p>
      <div style={{ marginBottom: 20 }}>
        <StatusBadge status={d.status} />
      </div>

      {/* Stats */}
      <div style={statRowStyle}>
        <StatTile icon="⏱" label="Total Duration" value={totalSec != null ? formatDurationSec(totalSec) : "—"} />
        <StatTile icon="⊟" label="Total Sets" value={String(d.sets.length)} />
        <StatTile icon="≡" label="Total Exercises" value={String(totalExercises)} />
      </div>

      {/* Notes */}
      {d.notes && (
        <div style={sectionStyle}>
          <p style={sectionLabelStyle}>NOTES</p>
          <p style={notesStyle}>{d.notes}</p>
        </div>
      )}

      {/* Breakdown */}
      <div style={sectionStyle}>
        <p style={sectionLabelStyle}>WORKOUT BREAKDOWN</p>
        {d.sets.map((set, si) => (
          <SetBlock key={set.id} set={set} index={si} />
        ))}
        <p style={footerNoteStyle}>All times are actual performed durations.</p>
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <p style={{ color: "#4b5563", fontSize: 14 }}>Select a session to view details.</p>
    </div>
  );
}

// ── Page root ─────────────────────────────────────────────────────────────────

export default function WorkoutHistory() {
  const navigate = useNavigate();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const { data: sessions = [], isLoading, error } = useQuery({
    queryKey: ["session-history"],
    queryFn: historyApi.list,
  });

  useEffect(() => {
    if (sessions.length > 0 && !selectedId) {
      setSelectedId(sessions[0].id);
    }
  }, [sessions, selectedId]);

  const filtered = search.trim()
    ? sessions.filter((s) =>
        (s.source_workout_template_name ?? "Workout")
          .toLowerCase()
          .includes(search.toLowerCase())
      )
    : sessions;

  return (
    <div style={rootStyle}>
      {/* ── Left panel ── */}
      <div style={leftPanelStyle}>
        <div style={leftHeaderStyle}>
          <button onClick={() => navigate("/")} style={backBtnStyle}>← Back</button>
          <h1 style={pageTitleStyle}>History</h1>
          <p style={pageSubtitleStyle}>Review your completed workouts.</p>

          <div style={searchWrapStyle}>
            <span style={searchIconStyle}>⌕</span>
            <input
              type="text"
              placeholder="Search sessions…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={searchInputStyle}
            />
          </div>
        </div>

        <div style={listStyle}>
          {isLoading && <p style={{ color: "#6b7280", padding: "16px 20px" }}>Loading…</p>}
          {error && <p style={{ color: "#f87171", padding: "16px 20px" }}>Failed to load history.</p>}
          {!isLoading && !error && filtered.length === 0 && (
            <p style={{ color: "#6b7280", padding: "32px 20px", textAlign: "center" }}>
              {search ? "No matching sessions." : "No workouts yet."}
            </p>
          )}
          {filtered.map((s) => (
            <SessionCard
              key={s.id}
              s={s}
              selected={s.id === selectedId}
              onSelect={() => setSelectedId(s.id)}
            />
          ))}
          {!isLoading && sessions.length > 0 && (
            <p style={sessionCountStyle}>{sessions.length} session{sessions.length !== 1 ? "s" : ""}</p>
          )}
        </div>
      </div>

      {/* ── Right panel ── */}
      <div style={rightPanelStyle}>
        {selectedId ? <DetailPane id={selectedId} /> : <EmptyState />}
      </div>
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

// Runner palette tokens
const BG = "#1c1c1e";
const CARD = "#2c2c2e";
const CARD_BORDER = "rgba(255,255,255,0.06)";
const TEXT_PRIMARY = "#f2f2f7";
const TEXT_SECONDARY = "#8e8e93";
const TEXT_MUTED = "#6b7280";
const DIVIDER = "rgba(255,255,255,0.07)";

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
  padding: "14px 20px 10px",
  flexShrink: 0,
  borderBottom: `1px solid ${DIVIDER}`,
};

const backBtnStyle: React.CSSProperties = {
  background: "none",
  border: "none",
  cursor: "pointer",
  fontSize: 13,
  color: TEXT_SECONDARY,
  padding: "0 0 10px",
  display: "block",
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

const searchWrapStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  background: CARD,
  border: `1px solid ${CARD_BORDER}`,
  borderRadius: 10,
  padding: "8px 12px",
};

const searchIconStyle: React.CSSProperties = {
  fontSize: 16,
  color: TEXT_MUTED,
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

const listStyle: React.CSSProperties = {
  flex: 1,
  overflowY: "auto",
  padding: "8px 0",
};

const sessionCountStyle: React.CSSProperties = {
  textAlign: "center",
  fontSize: 12,
  color: "#4b5563",
  padding: "12px 0 16px",
};

function sessionCardStyle(selected: boolean): React.CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    padding: "14px 20px",
    cursor: "pointer",
    background: selected ? "rgba(255,255,255,0.04)" : "transparent",
    boxShadow: selected ? "inset 3px 0 0 rgba(255,255,255,0.3)" : "none",
    borderBottom: `1px solid ${DIVIDER}`,
    transition: "background 0.1s",
  };
}

const cardNameStyle: React.CSSProperties = {
  margin: 0,
  fontWeight: 700,
  fontSize: 16,
  color: TEXT_PRIMARY,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const cardMetaStyle: React.CSSProperties = {
  margin: "3px 0 0",
  fontSize: 12,
  color: TEXT_MUTED,
};

const cardChevronStyle: React.CSSProperties = {
  fontSize: 20,
  color: "#4b5563",
  marginLeft: 12,
  flexShrink: 0,
};

const badgeBaseStyle: React.CSSProperties = {
  display: "inline-block",
  fontSize: 11,
  fontWeight: 600,
  padding: "2px 8px",
  borderRadius: 6,
  letterSpacing: "0.02em",
};

// Right panel

const rightPanelStyle: React.CSSProperties = {
  flex: 1,
  display: "flex",
  flexDirection: "column",
  overflow: "hidden",
  background: "#242426",
};

const detailScrollStyle: React.CSSProperties = {
  flex: 1,
  overflowY: "auto",
  padding: "28px 32px 48px",
};

const detailPlaceholderStyle: React.CSSProperties = {
  padding: 40,
  color: TEXT_MUTED,
};

const detailTitleStyle: React.CSSProperties = {
  fontSize: 28,
  fontWeight: 800,
  margin: "0 0 6px",
  letterSpacing: "-0.02em",
  color: TEXT_PRIMARY,
};

const detailDateStyle: React.CSSProperties = {
  fontSize: 13,
  color: TEXT_MUTED,
  margin: "0 0 12px",
};

const statRowStyle: React.CSSProperties = {
  display: "flex",
  gap: 12,
  marginBottom: 28,
};

const statTileStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  flex: 1,
  background: CARD,
  border: `1px solid ${CARD_BORDER}`,
  borderRadius: 12,
  padding: "12px 16px",
};

const statIconStyle: React.CSSProperties = {
  fontSize: 22,
  color: TEXT_SECONDARY,
  flexShrink: 0,
};

const statLabelStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 11,
  color: TEXT_MUTED,
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  fontWeight: 600,
};

const statValueStyle: React.CSSProperties = {
  margin: "2px 0 0",
  fontSize: 22,
  fontWeight: 700,
  color: TEXT_PRIMARY,
  fontVariantNumeric: "tabular-nums",
  letterSpacing: "-0.01em",
};

const sectionStyle: React.CSSProperties = {
  marginBottom: 24,
};

const sectionLabelStyle: React.CSSProperties = {
  margin: "0 0 12px",
  fontSize: 11,
  fontWeight: 700,
  color: TEXT_MUTED,
  textTransform: "uppercase",
  letterSpacing: "0.1em",
};

const notesStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 14,
  color: TEXT_SECONDARY,
  fontStyle: "italic",
  lineHeight: 1.6,
};

// Set block

const setBlockStyle: React.CSSProperties = {
  background: CARD,
  border: `1px solid ${CARD_BORDER}`,
  borderRadius: 12,
  marginBottom: 12,
  overflow: "hidden",
};

const setHeaderRow: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "12px 16px",
  borderBottom: `1px solid rgba(255,255,255,0.05)`,
};

const setTitleSpan: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 700,
  color: TEXT_SECONDARY,
  textTransform: "uppercase",
  letterSpacing: "0.06em",
};

// Exercise row

function exRowStyle(skipped: boolean): React.CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "10px 16px",
    borderBottom: `1px solid rgba(255,255,255,0.04)`,
    opacity: skipped ? 0.45 : 1,
  };
}

const exNumStyle: React.CSSProperties = {
  fontSize: 13,
  color: TEXT_MUTED,
  minWidth: 18,
  textAlign: "right",
  flexShrink: 0,
};

function exNameStyle(skipped: boolean): React.CSSProperties {
  return {
    flex: 1,
    fontSize: 14,
    color: TEXT_PRIMARY,
    fontWeight: 500,
    textDecoration: skipped ? "line-through" : "none",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  };
}

function tagStyle(isConcrete: boolean): React.CSSProperties {
  return {
    fontSize: 10,
    fontWeight: 600,
    padding: "2px 6px",
    borderRadius: 4,
    flexShrink: 0,
    background: isConcrete ? "rgba(59,130,246,0.12)" : "rgba(139,92,246,0.12)",
    color: isConcrete ? "#60a5fa" : "#a78bfa",
    border: isConcrete ? "1px solid rgba(59,130,246,0.2)" : "1px solid rgba(139,92,246,0.2)",
  };
}

const exDurStyle: React.CSSProperties = {
  fontSize: 13,
  color: TEXT_MUTED,
  fontVariantNumeric: "tabular-nums",
  flexShrink: 0,
  minWidth: 40,
  textAlign: "right",
};

const footerNoteStyle: React.CSSProperties = {
  margin: "16px 0 0",
  fontSize: 12,
  color: "#4b5563",
  fontStyle: "italic",
};
