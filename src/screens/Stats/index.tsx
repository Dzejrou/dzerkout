import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { tokens } from "../../theme/tokens";
import { statsApi } from "../../api/stats";
import type { StatsRange, TagStat, ExerciseStat } from "../../types/stats";

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDuration(sec: number): string {
  if (sec <= 0) return "0s";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SummaryCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div style={summaryCardStyle}>
      <span style={summaryValueStyle}>{value}</span>
      <span style={summaryLabelStyle}>{label}</span>
    </div>
  );
}

function TagRow({ stat }: { stat: TagStat }) {
  return (
    <div style={tableRowStyle}>
      <span style={{ ...tableColStyle, flex: 2, textTransform: "capitalize" }}>{stat.tag}</span>
      <span style={{ ...tableColStyle, textAlign: "right" }}>{fmtDuration(stat.duration_sec)}</span>
      <span style={{ ...tableColStyle, textAlign: "right", color: tokens.textSecondary }}>{stat.exercise_count}×</span>
    </div>
  );
}

function ExerciseRow({ stat }: { stat: ExerciseStat }) {
  return (
    <div style={tableRowStyle}>
      <div style={{ flex: 3, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 500, color: tokens.textPrimary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {stat.display_name}
        </div>
        <div style={{ fontSize: 11, color: tokens.textMuted, marginTop: 2 }}>
          {stat.exercise_count}× performed
          {stat.skipped_count > 0 && ` · ${stat.skipped_count} skipped`}
          {stat.last_performed_at && ` · last ${fmtDate(stat.last_performed_at)}`}
        </div>
      </div>
      <span style={{ ...tableColStyle, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
        {fmtDuration(stat.duration_sec)}
      </span>
    </div>
  );
}

// ── Range selector ────────────────────────────────────────────────────────────

const RANGES: { value: StatsRange; label: string }[] = [
  { value: "all", label: "All time" },
  { value: "30d", label: "30 days" },
  { value: "7d",  label: "7 days"  },
];

// ── Page ──────────────────────────────────────────────────────────────────────

export default function Stats() {
  const navigate = useNavigate();
  const [range, setRange] = useState<StatsRange>("all");

  const { data, isLoading, isError } = useQuery({
    queryKey: ["stats", range],
    queryFn: () => statsApi.getStats(range),
  });

  return (
    <div style={rootStyle}>
      <div style={contentStyle}>
        <button onClick={() => navigate("/")} style={backBtnStyle}>← Back</button>
        <h1 style={pageTitleStyle}>Stats</h1>

        {/* Range selector */}
        <div style={{ display: "flex", gap: 6, marginBottom: 24 }}>
          {RANGES.map(({ value, label }) => {
            const active = range === value;
            return (
              <button
                key={value}
                onClick={() => setRange(value)}
                style={{
                  padding: "6px 16px",
                  borderRadius: 8,
                  border: `1px solid ${active ? tokens.green : tokens.border}`,
                  background: active ? tokens.green : tokens.cardSubtle,
                  color: active ? tokens.greenText : tokens.textPrimary,
                  cursor: "pointer",
                  fontSize: 13,
                  fontWeight: active ? 600 : 400,
                  transition: "background 0.12s, border-color 0.12s",
                }}
              >
                {label}
              </button>
            );
          })}
        </div>

        {isLoading && <p style={{ color: tokens.textSecondary }}>Loading…</p>}
        {isError && <p style={{ color: tokens.red }}>Failed to load stats.</p>}

        {data && data.summary.completed_workouts === 0 && (
          <div style={emptyStyle}>
            <p style={{ fontSize: 17, fontWeight: 600, margin: "0 0 6px" }}>No completed workouts yet.</p>
            <p style={{ fontSize: 13, color: tokens.textSecondary, margin: 0 }}>
              Finish a workout to see your stats here.
            </p>
          </div>
        )}

        {data && data.summary.completed_workouts > 0 && (
          <>
            {/* Summary grid */}
            <section style={sectionStyle}>
              <h2 style={sectionTitleStyle}>Summary</h2>
              <div style={summaryGridStyle}>
                <SummaryCard label="Workouts" value={data.summary.completed_workouts} />
                <SummaryCard label="Workout time" value={fmtDuration(data.summary.total_workout_duration_sec)} />
                <SummaryCard label="Exercise time" value={fmtDuration(data.summary.total_exercise_duration_sec)} />
                <SummaryCard label="Sets" value={data.summary.total_sets} />
                <SummaryCard label="Exercises" value={data.summary.total_exercises} />
                <SummaryCard label="Skipped" value={data.summary.skipped_exercises} />
              </div>
              {data.summary.last_completed_at && (
                <p style={{ fontSize: 12, color: tokens.textMuted, marginTop: 8 }}>
                  Last workout: {fmtDate(data.summary.last_completed_at)}
                </p>
              )}
            </section>

            {/* Tag breakdown */}
            {data.tags.length > 0 && (
              <section style={sectionStyle}>
                <h2 style={sectionTitleStyle}>By tag</h2>
                <p style={{ fontSize: 11, color: tokens.textMuted, margin: "0 0 10px" }}>
                  Exercises with multiple tags count toward each tag independently.
                </p>
                <div style={tableStyle}>
                  <div style={{ ...tableRowStyle, borderBottom: `1px solid ${tokens.divider}` }}>
                    <span style={{ ...tableColStyle, flex: 2, color: tokens.textMuted, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>Tag</span>
                    <span style={{ ...tableColStyle, textAlign: "right", color: tokens.textMuted, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>Time</span>
                    <span style={{ ...tableColStyle, textAlign: "right", color: tokens.textMuted, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>Reps</span>
                  </div>
                  {data.tags.map((t) => <TagRow key={t.tag} stat={t} />)}
                </div>
              </section>
            )}

            {/* Exercise leaderboard */}
            {data.exercises.length > 0 && (
              <section style={sectionStyle}>
                <h2 style={sectionTitleStyle}>Top exercises</h2>
                <div style={tableStyle}>
                  <div style={{ ...tableRowStyle, borderBottom: `1px solid ${tokens.divider}` }}>
                    <span style={{ flex: 3, color: tokens.textMuted, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>Exercise</span>
                    <span style={{ ...tableColStyle, textAlign: "right", color: tokens.textMuted, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>Time</span>
                  </div>
                  {data.exercises.map((e) => <ExerciseRow key={e.exercise_key} stat={e} />)}
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const rootStyle: React.CSSProperties = {
  minHeight: "100%",
  background: tokens.bg,
  color: tokens.textPrimary,
};

const contentStyle: React.CSSProperties = {
  maxWidth: 640,
  margin: "0 auto",
  padding: "16px 20px 48px",
};

const backBtnStyle: React.CSSProperties = {
  background: tokens.surfaceActive,
  border: `1px solid ${tokens.borderStrong}`,
  borderRadius: 8,
  color: tokens.textLight,
  cursor: "pointer",
  fontSize: 13,
  fontWeight: 500,
  padding: "6px 14px",
  display: "block",
  marginBottom: 14,
};

const pageTitleStyle: React.CSSProperties = {
  fontSize: 34,
  fontWeight: 800,
  margin: "0 0 20px",
  letterSpacing: "-0.02em",
  color: tokens.textPrimary,
};

const sectionStyle: React.CSSProperties = {
  marginBottom: 32,
};

const sectionTitleStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  color: tokens.textSecondary,
  margin: "0 0 12px",
};

const summaryGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(3, 1fr)",
  gap: 10,
};

const summaryCardStyle: React.CSSProperties = {
  background: tokens.card,
  border: `1px solid ${tokens.borderSubtle}`,
  borderRadius: 12,
  padding: "14px 16px",
  display: "flex",
  flexDirection: "column",
  gap: 4,
};

const summaryValueStyle: React.CSSProperties = {
  fontSize: 22,
  fontWeight: 700,
  color: tokens.textPrimary,
  fontVariantNumeric: "tabular-nums",
  letterSpacing: "-0.01em",
};

const summaryLabelStyle: React.CSSProperties = {
  fontSize: 11,
  color: tokens.textSecondary,
  fontWeight: 500,
  textTransform: "uppercase",
  letterSpacing: "0.04em",
};

const emptyStyle: React.CSSProperties = {
  textAlign: "center",
  padding: "48px 20px",
  color: tokens.textPrimary,
};

const tableStyle: React.CSSProperties = {
  background: tokens.card,
  border: `1px solid ${tokens.borderSubtle}`,
  borderRadius: 12,
  overflow: "hidden",
};

const tableRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  padding: "10px 16px",
  borderBottom: `1px solid ${tokens.divider}`,
};

const tableColStyle: React.CSSProperties = {
  flex: 1,
  fontSize: 14,
  color: tokens.textPrimary,
};
