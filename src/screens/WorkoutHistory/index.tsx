import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { historyApi } from "../../api/history";
import type { SessionDetail, SessionSummary } from "../../types/session";

function formatDate(s: string | null): string {
  if (!s) return "—";
  return new Date(s).toLocaleDateString(undefined, { dateStyle: "medium" });
}

function formatDuration(startedAt: string | null, endedAt: string | null): string {
  if (!startedAt || !endedAt) return "";
  const diffSec = Math.round((new Date(endedAt).getTime() - new Date(startedAt).getTime()) / 1000);
  const m = Math.floor(diffSec / 60);
  const s = diffSec % 60;
  return `${m}m ${s}s`;
}

function DetailView({ id, onBack }: { id: string; onBack: () => void }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["session-detail", id],
    queryFn: () => historyApi.getDetail(id),
  });

  if (isLoading) return <p style={{ padding: 32, color: "#6b7280" }}>Loading…</p>;
  if (error || !data) return <p style={{ padding: 32, color: "#dc2626" }}>Failed to load session.</p>;

  const d = data as SessionDetail;
  return (
    <div style={pageStyle}>
      <button onClick={onBack} style={backBtnStyle}>← Back</button>
      <h2 style={headingStyle}>{d.source_workout_template_name ?? "Workout"}</h2>
      <p style={metaStyle}>
        {formatDate(d.session_date ?? d.started_at)}
        {d.started_at && d.ended_at && ` · ${formatDuration(d.started_at, d.ended_at)}`}
        <span style={statusBadgeStyle(d.status)}>{d.status}</span>
      </p>

      {d.sets.map((s, si) => (
        <div key={s.id} style={setCardStyle}>
          <p style={{ fontSize: 12, color: "#6b7280", margin: "0 0 6px" }}>Set {si + 1}</p>
          {s.exercises.map((e) => (
            <div key={e.id} style={exRowStyle(e.status)}>
              <span style={{ flex: 1, textDecoration: e.status === "skipped" ? "line-through" : "none", fontSize: 14 }}>
                {e.display_name}
              </span>
              {e.duration_hint_sec != null && (
                <span style={{ fontSize: 12, color: "#9ca3af" }}>{e.duration_hint_sec}s</span>
              )}
              <span style={{ fontSize: 12, color: "#9ca3af", marginLeft: 8 }}>
                {e.status === "completed" ? "✓" : e.status === "skipped" ? "skip" : e.status === "active" ? "▶" : ""}
              </span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function SummaryRow({ s, onSelect }: { s: SessionSummary; onSelect: () => void }) {
  return (
    <div onClick={onSelect} style={summaryRowStyle}>
      <div style={{ flex: 1 }}>
        <p style={{ margin: 0, fontWeight: 600, fontSize: 15 }}>
          {s.source_workout_template_name ?? "Workout"}
        </p>
        <p style={{ margin: "2px 0 0", fontSize: 12, color: "#6b7280" }}>
          {formatDate(s.session_date ?? s.started_at)} · {s.set_count} set{s.set_count !== 1 ? "s" : ""} · {s.exercise_count} exercise{s.exercise_count !== 1 ? "s" : ""}
        </p>
      </div>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
        <span style={statusBadgeStyle(s.status)}>{s.status === "in_progress" ? "In Progress" : "Done"}</span>
        <span style={{ fontSize: 11, color: "#9ca3af" }}>›</span>
      </div>
    </div>
  );
}

export default function WorkoutHistory() {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data: sessions = [], isLoading, error } = useQuery({
    queryKey: ["session-history"],
    queryFn: historyApi.list,
  });

  if (selectedId) {
    return <DetailView id={selectedId} onBack={() => setSelectedId(null)} />;
  }

  return (
    <div style={pageStyle}>
      <h2 style={headingStyle}>History</h2>
      {isLoading && <p style={{ color: "#6b7280" }}>Loading…</p>}
      {error && <p style={{ color: "#dc2626" }}>Failed to load history.</p>}
      {!isLoading && !error && sessions.length === 0 && (
        <p style={{ color: "#6b7280", textAlign: "center", marginTop: 32 }}>No workouts yet.</p>
      )}
      {sessions.map((s) => (
        <SummaryRow key={s.id} s={s} onSelect={() => setSelectedId(s.id)} />
      ))}
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const pageStyle: React.CSSProperties = { padding: "12px 16px", maxWidth: 560, margin: "0 auto" };
const headingStyle: React.CSSProperties = { fontSize: 20, fontWeight: 700, margin: "0 0 12px" };
const metaStyle: React.CSSProperties = { fontSize: 13, color: "#6b7280", margin: "0 0 16px", display: "flex", alignItems: "center", gap: 8 };
const backBtnStyle: React.CSSProperties = {
  background: "none", border: "none", cursor: "pointer", fontSize: 14, color: "#2563eb",
  padding: "0 0 12px", display: "block",
};
const summaryRowStyle: React.CSSProperties = {
  display: "flex", alignItems: "center", padding: "12px 14px",
  border: "1px solid #e5e7eb", borderRadius: 8, marginBottom: 8,
  background: "#fff", cursor: "pointer",
};
const setCardStyle: React.CSSProperties = {
  background: "#f8fafc", border: "1px solid #e5e7eb", borderRadius: 8,
  padding: "10px 12px", marginBottom: 10,
};

function exRowStyle(status: string): React.CSSProperties {
  return {
    display: "flex", alignItems: "center", padding: "4px 0",
    opacity: status === "skipped" ? 0.5 : 1,
  };
}

function statusBadgeStyle(status: string): React.CSSProperties {
  const isInProgress = status === "in_progress";
  return {
    fontSize: 11, fontWeight: 600, padding: "2px 6px", borderRadius: 4,
    background: isInProgress ? "#fef3c7" : "#dcfce7",
    color: isInProgress ? "#92400e" : "#15803d",
  };
}
