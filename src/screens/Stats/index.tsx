import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { statsApi } from "../../api/stats";
import { tokens } from "../../theme/tokens";
import type { StatsRange, TagStat, ExerciseStat, MetadataStat } from "../../types/stats";

// ── Token aliases ─────────────────────────────────────────────────────────────

const {
  bg: BG,
  bgElevated: BG_ELEVATED,
  card: CARD,
  borderSubtle: CARD_BORDER,
  divider: DIVIDER,
  textPrimary: TEXT_PRIMARY,
  textSecondary: TEXT_SECONDARY,
  textMuted: TEXT_MUTED,
  textDisabled: TEXT_DISABLED,
  textLight: TEXT_LIGHT,
  surfaceSelected: SURFACE_SELECTED,
} = tokens;

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

// ── Humanization helpers ──────────────────────────────────────────────────────

function humanize(str: string): string {
  return str.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
}

function humanizeSource(key: string): string {
  if (key === "local") return "Local";
  if (key === "free-exercise-db") return "Free Exercise DB";
  if (key === "yoga-poses") return "Yoga";
  return key;
}

// ── Category + range definitions ──────────────────────────────────────────────

type StatsCategory =
  | "summary"
  | "by-tag"
  | "by-category"
  | "by-equipment"
  | "by-muscle"
  | "by-pose-type"
  | "by-source"
  | "top-exercises";

const CATEGORIES: { value: StatsCategory; label: string; desc: string }[] = [
  { value: "summary",       label: "Summary",       desc: "Totals and time overview"       },
  { value: "by-tag",        label: "By Tag",        desc: "Time and reps per tag"          },
  { value: "by-category",   label: "By Category",   desc: "Time per exercise category"     },
  { value: "by-equipment",  label: "By Equipment",  desc: "Time per equipment type"        },
  { value: "by-muscle",     label: "By Muscle",     desc: "Primary muscles worked"         },
  { value: "by-pose-type",  label: "By Pose Type",  desc: "Yoga pose type breakdown"       },
  { value: "by-source",     label: "By Source",     desc: "Local vs catalog breakdown"     },
  { value: "top-exercises", label: "Top Exercises", desc: "Exercise leaderboard"           },
];

const RANGES: { value: StatsRange; label: string }[] = [
  { value: "all", label: "All time" },
  { value: "30d", label: "30 days"  },
  { value: "7d",  label: "7 days"   },
];

// ── Left panel: category cards ────────────────────────────────────────────────

function CategoryCard({
  label, desc, selected, onClick,
}: { label: string; desc: string; selected: boolean; onClick: () => void }) {
  return (
    <div onClick={onClick} style={categoryCardStyle(selected)}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={cardNameStyle}>{label}</p>
        <p style={cardMetaStyle}>{desc}</p>
      </div>
      <span style={cardChevronStyle}>›</span>
    </div>
  );
}

// ── Right panel sub-components ────────────────────────────────────────────────

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
      <span style={{ ...tableColStyle, textAlign: "right", color: TEXT_SECONDARY }}>{stat.exercise_count}×</span>
    </div>
  );
}

function ExerciseRow({ stat }: { stat: ExerciseStat }) {
  return (
    <div style={tableRowStyle}>
      <div style={{ flex: 3, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 500, color: TEXT_PRIMARY, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {stat.display_name}
        </div>
        <div style={{ fontSize: 11, color: TEXT_MUTED, marginTop: 2 }}>
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

// ── Right panel: range selector strip ────────────────────────────────────────

function RangeSelector({
  range, onChange,
}: { range: StatsRange; onChange: (r: StatsRange) => void }) {
  return (
    <div style={rangeSelectorStyle}>
      {RANGES.map(({ value, label }) => {
        const active = range === value;
        return (
          <button
            key={value}
            onClick={() => onChange(value)}
            style={{
              padding: "5px 16px",
              borderRadius: 7,
              border: `1px solid ${active ? tokens.green : tokens.border}`,
              background: active ? tokens.green : tokens.cardSubtle,
              color: active ? tokens.greenText : tokens.textPrimary,
              cursor: "pointer",
              fontSize: 13,
              fontWeight: active ? 600 : 400,
              fontFamily: "inherit",
              transition: "background 0.12s, border-color 0.12s",
            }}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

// ── Right panel: category views ───────────────────────────────────────────────

function SummaryView({ range }: { range: StatsRange }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["stats", range],
    queryFn: () => statsApi.getStats(range),
  });

  if (isLoading) return <p style={statusTextStyle}>Loading…</p>;
  if (isError)   return <p style={{ ...statusTextStyle, color: tokens.red }}>Failed to load stats.</p>;
  if (!data || data.summary.completed_workouts === 0) return <EmptyCategoryState />;

  const s = data.summary;
  return (
    <>
      <div style={summaryGridStyle}>
        <SummaryCard label="Workouts"      value={s.completed_workouts} />
        <SummaryCard label="Workout time"  value={fmtDuration(s.total_workout_duration_sec)} />
        <SummaryCard label="Exercise time" value={fmtDuration(s.total_exercise_duration_sec)} />
        <SummaryCard label="Sets"          value={s.total_sets} />
        <SummaryCard label="Exercises"     value={s.total_exercises} />
        <SummaryCard label="Skipped"       value={s.skipped_exercises} />
      </div>
      {s.last_completed_at && (
        <p style={{ fontSize: 12, color: TEXT_MUTED, marginTop: 12 }}>
          Last workout: {fmtDate(s.last_completed_at)}
        </p>
      )}
    </>
  );
}

function ByTagView({ range }: { range: StatsRange }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["stats", range],
    queryFn: () => statsApi.getStats(range),
  });

  if (isLoading) return <p style={statusTextStyle}>Loading…</p>;
  if (isError)   return <p style={{ ...statusTextStyle, color: tokens.red }}>Failed to load stats.</p>;
  if (!data || data.summary.completed_workouts === 0) return <EmptyCategoryState />;
  if (data.tags.length === 0) return (
    <p style={{ color: TEXT_MUTED, fontSize: 14, marginTop: 8 }}>No tag data for this period.</p>
  );

  return (
    <>
      <p style={{ fontSize: 11, color: TEXT_MUTED, margin: "0 0 12px" }}>
        Exercises with multiple tags count toward each tag independently.
      </p>
      <div style={tableStyle}>
        <div style={{ ...tableRowStyle, borderBottom: `1px solid ${DIVIDER}` }}>
          <span style={thStyle(2)}>Tag</span>
          <span style={{ ...thStyle(1), textAlign: "right" }}>Time</span>
          <span style={{ ...thStyle(1), textAlign: "right" }}>Reps</span>
        </div>
        {data.tags.map((t) => <TagRow key={t.tag} stat={t} />)}
      </div>
    </>
  );
}

function TopExercisesView({ range }: { range: StatsRange }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["stats", range],
    queryFn: () => statsApi.getStats(range),
  });

  if (isLoading) return <p style={statusTextStyle}>Loading…</p>;
  if (isError)   return <p style={{ ...statusTextStyle, color: tokens.red }}>Failed to load stats.</p>;
  if (!data || data.summary.completed_workouts === 0) return <EmptyCategoryState />;
  if (data.exercises.length === 0) return (
    <p style={{ color: TEXT_MUTED, fontSize: 14, marginTop: 8 }}>No exercise data for this period.</p>
  );

  return (
    <div style={tableStyle}>
      <div style={{ ...tableRowStyle, borderBottom: `1px solid ${DIVIDER}` }}>
        <span style={{ flex: 3, color: TEXT_MUTED, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>Exercise</span>
        <span style={{ ...thStyle(1), textAlign: "right" }}>Time</span>
      </div>
      {data.exercises.map((e) => <ExerciseRow key={e.exercise_key} stat={e} />)}
    </div>
  );
}

function MetadataRow({ stat, labelFn }: { stat: MetadataStat; labelFn: (key: string) => string }) {
  return (
    <div style={tableRowStyle}>
      <div style={{ flex: 2, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 500, color: TEXT_PRIMARY }}>{labelFn(stat.key)}</div>
        {stat.skipped_count > 0 && (
          <div style={{ fontSize: 11, color: TEXT_MUTED, marginTop: 2 }}>{stat.skipped_count} skipped</div>
        )}
      </div>
      <span style={{ ...tableColStyle, textAlign: "right" }}>{fmtDuration(stat.duration_sec)}</span>
      <span style={{ ...tableColStyle, textAlign: "right", color: TEXT_SECONDARY }}>{stat.exercise_count}×</span>
    </div>
  );
}

function MetadataTable({
  rows, labelFn, colLabel, note,
}: { rows: MetadataStat[]; labelFn: (key: string) => string; colLabel: string; note?: string }) {
  return (
    <>
      {note && (
        <p style={{ fontSize: 11, color: TEXT_MUTED, margin: "0 0 12px" }}>{note}</p>
      )}
      <div style={tableStyle}>
        <div style={{ ...tableRowStyle, borderBottom: `1px solid ${DIVIDER}` }}>
          <span style={thStyle(2)}>{colLabel}</span>
          <span style={{ ...thStyle(1), textAlign: "right" }}>Time</span>
          <span style={{ ...thStyle(1), textAlign: "right" }}>Reps</span>
        </div>
        {rows.map((r) => <MetadataRow key={r.key} stat={r} labelFn={labelFn} />)}
      </div>
    </>
  );
}

function MetadataView({
  range, field, colLabel, labelFn, emptyMsg, note,
}: {
  range: StatsRange;
  field: "by_category" | "by_equipment" | "by_primary_muscle" | "by_pose_type" | "by_source";
  colLabel: string;
  labelFn: (key: string) => string;
  emptyMsg: string;
  note?: string;
}) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["stats", range],
    queryFn: () => statsApi.getStats(range),
  });

  if (isLoading) return <p style={statusTextStyle}>Loading…</p>;
  if (isError)   return <p style={{ ...statusTextStyle, color: tokens.red }}>Failed to load stats.</p>;
  if (!data || data.summary.completed_workouts === 0) return <EmptyCategoryState />;

  const rows = data[field];
  if (rows.length === 0) return (
    <p style={{ color: TEXT_MUTED, fontSize: 14, marginTop: 8 }}>{emptyMsg}</p>
  );

  return <MetadataTable rows={rows} labelFn={labelFn} colLabel={colLabel} note={note} />;
}

function EmptyCategoryState() {
  return (
    <div style={emptyStyle}>
      <p style={{ fontSize: 17, fontWeight: 600, margin: "0 0 6px", color: TEXT_PRIMARY }}>
        No completed workouts yet.
      </p>
      <p style={{ fontSize: 13, color: TEXT_MUTED, margin: 0 }}>
        Finish a workout to see your stats here.
      </p>
    </div>
  );
}

// ── Right panel: full detail pane ─────────────────────────────────────────────

function StatsDetail({
  category, range, onRangeChange,
}: { category: StatsCategory; range: StatsRange; onRangeChange: (r: StatsRange) => void }) {
  const categoryLabel = CATEGORIES.find((c) => c.value === category)?.label ?? "Stats";

  return (
    <div style={detailScrollStyle}>
      {/* Range selector — always visible at the top of the right panel */}
      <div style={detailHeaderStyle}>
        <h2 style={detailTitleStyle}>{categoryLabel}</h2>
        <RangeSelector range={range} onChange={onRangeChange} />
      </div>

      {/* Category-specific content */}
      <div style={detailBodyStyle}>
        {category === "summary"       && <SummaryView      range={range} />}
        {category === "by-tag"        && <ByTagView        range={range} />}
        {category === "by-category"   && (
          <MetadataView
            range={range}
            field="by_category"
            colLabel="Category"
            labelFn={humanize}
            emptyMsg="No category data for this period."
          />
        )}
        {category === "by-equipment"  && (
          <MetadataView
            range={range}
            field="by_equipment"
            colLabel="Equipment"
            labelFn={humanize}
            emptyMsg="No equipment data for this period."
          />
        )}
        {category === "by-muscle"     && (
          <MetadataView
            range={range}
            field="by_primary_muscle"
            colLabel="Muscle"
            labelFn={humanize}
            emptyMsg="No muscle data for this period."
            note="Totals may exceed overall exercise duration — one exercise can target multiple primary muscles."
          />
        )}
        {category === "by-pose-type"  && (
          <MetadataView
            range={range}
            field="by_pose_type"
            colLabel="Pose type"
            labelFn={humanize}
            emptyMsg="No pose type data for this period."
            note="Totals may exceed overall exercise duration — one exercise can have multiple pose types."
          />
        )}
        {category === "by-source"     && (
          <MetadataView
            range={range}
            field="by_source"
            colLabel="Source"
            labelFn={humanizeSource}
            emptyMsg="No source data for this period."
          />
        )}
        {category === "top-exercises" && <TopExercisesView range={range} />}
      </div>
    </div>
  );
}

// ── Page root ─────────────────────────────────────────────────────────────────

export default function Stats() {
  const navigate = useNavigate();
  const [category, setCategory] = useState<StatsCategory>("summary");
  const [range, setRange] = useState<StatsRange>("all");

  return (
    <div style={rootStyle}>
      {/* ── Left panel ── */}
      <div style={leftPanelStyle}>
        <div style={leftHeaderStyle}>
          <button onClick={() => navigate("/")} style={backBtnStyle}>← Back</button>
          <h1 style={pageTitleStyle}>Stats</h1>
          <p style={pageSubtitleStyle}>Aggregates across completed workouts.</p>
        </div>
        <div style={listStyle}>
          {CATEGORIES.map(({ value, label, desc }) => (
            <CategoryCard
              key={value}
              label={label}
              desc={desc}
              selected={category === value}
              onClick={() => setCategory(value)}
            />
          ))}
        </div>
      </div>

      {/* ── Right panel ── */}
      <div style={rightPanelStyle}>
        <StatsDetail category={category} range={range} onRangeChange={setRange} />
      </div>
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const rootStyle: React.CSSProperties = {
  display: "flex",
  height: "100%",
  background: BG,
  color: TEXT_PRIMARY,
  overflow: "hidden",
};

// Left panel

const leftPanelStyle: React.CSSProperties = {
  width: "var(--left-panel-w)",
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
  background: tokens.surfaceActive,
  border: `1px solid ${tokens.borderStrong}`,
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
  margin: 0,
};

const listStyle: React.CSSProperties = {
  flex: 1,
  overflowY: "auto",
  padding: "8px 0",
};

function categoryCardStyle(selected: boolean): React.CSSProperties {
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

const cardNameStyle: React.CSSProperties = {
  margin: 0,
  fontWeight: 700,
  fontSize: 16,
  color: TEXT_PRIMARY,
};

const cardMetaStyle: React.CSSProperties = {
  margin: "2px 0 0",
  fontSize: 12,
  color: TEXT_MUTED,
};

const cardChevronStyle: React.CSSProperties = {
  fontSize: 20,
  color: TEXT_DISABLED,
  marginLeft: 12,
  flexShrink: 0,
};

// Right panel

const rightPanelStyle: React.CSSProperties = {
  flex: 1,
  display: "flex",
  flexDirection: "column",
  overflow: "hidden",
  background: BG_ELEVATED,
};

const detailScrollStyle: React.CSSProperties = {
  flex: 1,
  overflowY: "auto",
  display: "flex",
  flexDirection: "column",
};

const detailHeaderStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  flexWrap: "wrap",
  gap: 12,
  padding: "20px 32px 16px",
  flexShrink: 0,
  borderBottom: `1px solid ${DIVIDER}`,
};

const detailTitleStyle: React.CSSProperties = {
  fontSize: 24,
  fontWeight: 800,
  margin: 0,
  letterSpacing: "-0.02em",
  color: TEXT_PRIMARY,
};

const rangeSelectorStyle: React.CSSProperties = {
  display: "flex",
  gap: 6,
};

const detailBodyStyle: React.CSSProperties = {
  padding: "24px 32px 48px",
  flex: 1,
};

const statusTextStyle: React.CSSProperties = {
  color: TEXT_SECONDARY,
  marginTop: 8,
};

const emptyStyle: React.CSSProperties = {
  textAlign: "center",
  padding: "48px 20px",
};

const summaryGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(3, 1fr)",
  gap: 10,
};

const summaryCardStyle: React.CSSProperties = {
  background: CARD,
  border: `1px solid ${CARD_BORDER}`,
  borderRadius: 12,
  padding: "14px 16px",
  display: "flex",
  flexDirection: "column",
  gap: 4,
};

const summaryValueStyle: React.CSSProperties = {
  fontSize: 22,
  fontWeight: 700,
  color: TEXT_PRIMARY,
  fontVariantNumeric: "tabular-nums",
  letterSpacing: "-0.01em",
};

const summaryLabelStyle: React.CSSProperties = {
  fontSize: 11,
  color: TEXT_SECONDARY,
  fontWeight: 500,
  textTransform: "uppercase",
  letterSpacing: "0.04em",
};

const tableStyle: React.CSSProperties = {
  background: CARD,
  border: `1px solid ${CARD_BORDER}`,
  borderRadius: 12,
  overflow: "hidden",
};

const tableRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  padding: "10px 16px",
  borderBottom: `1px solid ${DIVIDER}`,
};

const tableColStyle: React.CSSProperties = {
  flex: 1,
  fontSize: 14,
  color: TEXT_PRIMARY,
};

function thStyle(flex: number): React.CSSProperties {
  return {
    flex,
    color: TEXT_MUTED,
    fontSize: 11,
    fontWeight: 700,
    textTransform: "uppercase" as const,
    letterSpacing: "0.05em",
  };
}
