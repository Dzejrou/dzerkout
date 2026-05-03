import { useState, useRef, useCallback, createContext, useContext } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { tokens, THEME_KEYS, themeNames, type ThemeKey } from "../../theme/tokens";
import { useSettingsStore } from "../../store/settingsStore";
import { useSessionStore } from "../../store/sessionStore";
import { playPreviewCue } from "../../audio/cues";
import { writeText as clipboardWriteText } from "@tauri-apps/plugin-clipboard-manager";
import { libraryApi } from "../../api/library";
import { exercisesApi } from "../../api/exercises";
import { setTemplatesApi } from "../../api/setTemplates";
import { workoutTemplatesApi } from "../../api/workoutTemplates";
import { historyApi } from "../../api/history";
import { statsApi } from "../../api/stats";
import { saveJsonToFile, pickJsonFile, readJsonFile } from "../../api/fileExport";
import type { ImportResult } from "../../types/library";
import { ConfirmModal } from "../../components/ConfirmModal";

// ── Token aliases ─────────────────────────────────────────────────────────────

const {
  bg: BG,
  bgElevated: BG_ELEVATED,
  divider: DIVIDER,
  textPrimary: TEXT_PRIMARY,
  textMuted: TEXT_MUTED,
  textDisabled: TEXT_DISABLED,
  textLight: TEXT_LIGHT,
  surfaceSelected: SURFACE_SELECTED,
} = tokens;

// ── Category definitions ──────────────────────────────────────────────────────

type SettingsCategory = "appearance" | "runner" | "sound" | "data";

const CATEGORIES: { value: SettingsCategory; label: string; desc: string }[] = [
  { value: "appearance", label: "Appearance", desc: "Theme and display"          },
  { value: "runner",     label: "Runner",     desc: "Auto-advance and timing"    },
  { value: "sound",      label: "Sound",      desc: "Cues and audio feedback"    },
  { value: "data",       label: "Data",       desc: "Backup, import, and reset"  },
];

// ── Phase logging ─────────────────────────────────────────────────────────────

function importLog(opId: number, phase: string, detail?: string) {
  const ts = new Date().toISOString();
  console.log(`[import:${opId}] ${ts} ${phase}${detail ? " — " + detail : ""}`);
}

// ── Shared data-op mutex ──────────────────────────────────────────────────────

interface DataOpCtx {
  isDataBusy: boolean;
  tryAcquire: () => boolean;
  releaseDataBusy: () => void;
}

const DataOpContext = createContext<DataOpCtx>({
  isDataBusy: false,
  tryAcquire: () => true,
  releaseDataBusy: () => {},
});

function useDataOp() {
  return useContext(DataOpContext);
}

// ── Cache refresh ─────────────────────────────────────────────────────────────

function removeAllAppDataQueries(qc: QueryClient) {
  qc.removeQueries({ queryKey: ["exercises"] });
  qc.removeQueries({ queryKey: ["set-templates"] });
  qc.removeQueries({ queryKey: ["set-template"] });
  qc.removeQueries({ queryKey: ["workout-templates"] });
  qc.removeQueries({ queryKey: ["workout-template"] });
  qc.removeQueries({ queryKey: ["session-history"] });
  qc.removeQueries({ queryKey: ["session-detail"] });
  qc.removeQueries({ queryKey: ["stats"] });
}

async function hydrateCoreLists(qc: QueryClient) {
  await Promise.allSettled([
    qc.fetchQuery({ queryKey: ["exercises"],         queryFn: exercisesApi.list }),
    qc.fetchQuery({ queryKey: ["set-templates"],     queryFn: setTemplatesApi.list }),
    qc.fetchQuery({ queryKey: ["workout-templates"], queryFn: workoutTemplatesApi.list }),
    qc.fetchQuery({ queryKey: ["session-history"],   queryFn: historyApi.list }),
    qc.fetchQuery({ queryKey: ["stats", "all"],      queryFn: () => statsApi.getStats("all") }),
  ]);
}

// ── Shared UI primitives ──────────────────────────────────────────────────────

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      role="switch"
      aria-checked={value}
      onClick={() => onChange(!value)}
      style={{
        position: "relative",
        width: 44,
        height: 26,
        borderRadius: 13,
        background: value ? tokens.green : tokens.cardSubtle,
        border: `1px solid ${value ? tokens.greenBorder : tokens.border}`,
        cursor: "pointer",
        padding: 0,
        flexShrink: 0,
        transition: "background 0.18s, border-color 0.18s",
      }}
    >
      <span
        style={{
          position: "absolute",
          top: 3,
          left: value ? 21 : 3,
          width: 18,
          height: 18,
          borderRadius: "50%",
          background: "#fff",
          transition: "left 0.18s",
          display: "block",
        }}
      />
    </button>
  );
}

interface SettingRowProps {
  label: string;
  description?: string;
  control: React.ReactNode;
  disabled?: boolean;
}

function SettingRow({ label, description, control, disabled }: SettingRowProps) {
  return (
    <div style={{ ...rowStyle, opacity: disabled ? 0.45 : 1 }}>
      <div style={rowBodyStyle}>
        <span style={rowLabelStyle}>{label}</span>
        {description && <span style={rowDescStyle}>{description}</span>}
      </div>
      <div style={rowControlStyle}>{control}</div>
    </div>
  );
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={sectionStyle}>
      <h2 style={sectionTitleStyle}>{title}</h2>
      <div style={sectionCardStyle}>{children}</div>
    </div>
  );
}

function ComingSoonBadge() {
  return <span style={comingSoonStyle}>Coming soon</span>;
}

interface SliderControlProps {
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
}

function SliderControl({ value, onChange, min, max, step, format }: SliderControlProps) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <span style={sliderValueStyle}>{format(value)}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        style={{ width: 120, accentColor: tokens.green, cursor: "pointer" }}
      />
    </div>
  );
}

function ThemeSelector() {
  const theme = useSettingsStore((s) => s.theme);
  const setTheme = useSettingsStore((s) => s.setTheme);
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
      {THEME_KEYS.map((key: ThemeKey) => {
        const active = theme === key;
        return (
          <button
            key={key}
            onClick={() => setTheme(key)}
            style={{
              padding: "5px 13px",
              borderRadius: 7,
              border: `1px solid ${active ? tokens.green : tokens.border}`,
              background: active ? tokens.green : tokens.cardSubtle,
              color: active ? tokens.greenText : tokens.textPrimary,
              cursor: "pointer",
              fontSize: 13,
              fontWeight: active ? 600 : 400,
              transition: "background 0.12s, border-color 0.12s, color 0.12s",
            }}
          >
            {themeNames[key]}
          </button>
        );
      })}
    </div>
  );
}

// ── Category view: Appearance ─────────────────────────────────────────────────

function AppearanceCategoryView() {
  const runnerCardSize = useSettingsStore((s) => s.runnerCardSize);
  const setRunnerCardSize = useSettingsStore((s) => s.setRunnerCardSize);
  return (
    <SectionCard title="Appearance">
      <SettingRow
        label="Theme"
        description="Color scheme used throughout the app."
        control={<ThemeSelector />}
      />
      <div style={rowDividerStyle} />
      <SettingRow
        label="Runner card size"
        description="Height of exercise queue cards in the workout runner."
        control={
          <SliderControl
            value={runnerCardSize}
            onChange={setRunnerCardSize}
            min={0.5}
            max={2.0}
            step={0.1}
            format={(v) => `${Math.round(v * 100)}%`}
          />
        }
      />
      <div style={rowDividerStyle} />
      <SettingRow
        label="Additional themes"
        description="Light mode and custom palettes."
        control={<ComingSoonBadge />}
        disabled
      />
    </SectionCard>
  );
}

// ── Category view: Runner ─────────────────────────────────────────────────────

function RunnerCategoryView() {
  const autoAdvance = useSettingsStore((s) => s.autoAdvance);
  const setAutoAdvance = useSettingsStore((s) => s.setAutoAdvance);
  const autoStartNextSet = useSettingsStore((s) => s.autoStartNextSet);
  const setAutoStartNextSet = useSettingsStore((s) => s.setAutoStartNextSet);
  return (
    <SectionCard title="Runner">
      <SettingRow
        label="Auto-advance exercises"
        description="When an exercise has a duration target, automatically move to the next exercise when time is up."
        control={<Toggle value={autoAdvance} onChange={setAutoAdvance} />}
      />
      <div style={rowDividerStyle} />
      <SettingRow
        label="Auto-start next set"
        description="Automatically start the next set when between-set rest reaches zero."
        control={<Toggle value={autoStartNextSet} onChange={setAutoStartNextSet} />}
      />
    </SectionCard>
  );
}

// ── Category view: Sound ──────────────────────────────────────────────────────

function SoundCategoryView() {
  const soundCues = useSettingsStore((s) => s.soundCues);
  const setSoundCues = useSettingsStore((s) => s.setSoundCues);
  return (
    <SectionCard title="Sound">
      <SettingRow
        label="Sound cues"
        description="Play countdown beeps near the end of timed exercises and between-set rest."
        control={<Toggle value={soundCues} onChange={setSoundCues} />}
      />
      <div style={rowDividerStyle} />
      <SettingRow
        label="Preview cue"
        description="Play the full countdown sequence right now so you know what to expect."
        control={
          <button onClick={playPreviewCue} style={previewBtnStyle}>
            ▶ Preview
          </button>
        }
      />
    </SectionCard>
  );
}

// ── Category view: Data ───────────────────────────────────────────────────────
// Contains export/import (LibrarySection) and the Danger Zone.

function LibrarySection() {
  const queryClient = useQueryClient();
  const { isDataBusy, tryAcquire, releaseDataBusy } = useDataOp();

  const [exportStatus, setExportStatus] = useState<"idle" | "loading" | "copied" | "error">("idle");
  const [exportFallbackJson, setExportFallbackJson] = useState<string | null>(null);
  const [fileExportStatus, setFileExportStatus] = useState<"idle" | "loading" | "saved" | "error">("idle");
  const [importText, setImportText] = useState("");
  const [importStatus, setImportStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  type FileImportStatus = "idle" | "picking" | "reading" | "importing" | "refreshing" | "success" | "error";
  const [fileImportStatus, setFileImportStatus] = useState<FileImportStatus>("idle");
  const [fileImportResult, setFileImportResult] = useState<ImportResult | null>(null);
  const [fileImportError, setFileImportError] = useState<string | null>(null);
  const fileImportOpRef = useRef(0);

  async function handleExport() {
    setExportStatus("loading");
    setExportFallbackJson(null);
    try {
      const json = await libraryApi.exportJson();
      try {
        await clipboardWriteText(json);
        setExportStatus("copied");
        setTimeout(() => setExportStatus("idle"), 2500);
      } catch {
        setExportFallbackJson(json);
        setExportStatus("error");
      }
    } catch {
      setExportStatus("error");
      setTimeout(() => setExportStatus("idle"), 3000);
    }
  }

  async function handleFileExport() {
    setFileExportStatus("loading");
    try {
      const json = await libraryApi.exportJson();
      const outcome = await saveJsonToFile(json);
      if (outcome === "cancelled") { setFileExportStatus("idle"); return; }
      setFileExportStatus("saved");
      setTimeout(() => setFileExportStatus("idle"), 2500);
    } catch {
      setFileExportStatus("error");
      setTimeout(() => setFileExportStatus("idle"), 3000);
    }
  }

  async function handleImport() {
    if (!importText.trim()) return;
    if (!tryAcquire()) return;
    setImportStatus("loading");
    setImportResult(null);
    setImportError(null);
    try {
      const result = await libraryApi.importJson(importText.trim());
      removeAllAppDataQueries(queryClient);
      await hydrateCoreLists(queryClient);
      setImportResult(result);
      setImportStatus("success");
      setImportText("");
    } catch (err) {
      setImportError(err instanceof Error ? err.message : String(err));
      setImportStatus("error");
    } finally {
      releaseDataBusy();
    }
  }

  function cancelFileImport() {
    fileImportOpRef.current++;
    setFileImportStatus("idle");
    setFileImportError(null);
    releaseDataBusy();
  }

  async function handleFileImport() {
    if (!tryAcquire()) return;
    const opId = ++fileImportOpRef.current;
    const owned = () => fileImportOpRef.current === opId;
    setFileImportResult(null);
    setFileImportError(null);
    setFileImportStatus("picking");
    try {
      importLog(opId, "picking", "entering picker");
      const filePath = await pickJsonFile();
      importLog(opId, "picker-returned", filePath ?? "null");
      if (!owned()) { importLog(opId, "stale", "discarding — newer op is active"); return; }
      if (filePath == null) { importLog(opId, "cancelled", "picker returned null"); setFileImportStatus("idle"); return; }
      setFileImportStatus("reading");
      importLog(opId, "reading", filePath);
      const json = await readJsonFile(filePath);
      importLog(opId, "reading-done", `${json.length} chars`);
      if (!owned()) return;
      const trimmed = json.trim();
      if (!trimmed) throw new Error("Selected file is empty");
      setFileImportStatus("importing");
      importLog(opId, "importing");
      const result = await libraryApi.importJson(trimmed);
      importLog(opId, "importing-done", `ex+${result.exercises_created}/upd${result.exercises_updated}`);
      if (!owned()) return;
      setFileImportStatus("refreshing");
      importLog(opId, "refreshing");
      removeAllAppDataQueries(queryClient);
      await hydrateCoreLists(queryClient);
      importLog(opId, "hydration-done");
      if (!owned()) return;
      setFileImportResult(result);
      setFileImportStatus("success");
      importLog(opId, "success");
    } catch (err) {
      importLog(opId, "error", String(err));
      if (owned()) {
        setFileImportError(err instanceof Error ? err.message : String(err));
        setFileImportStatus("error");
      }
    } finally {
      if (owned()) {
        setFileImportStatus((prev) => {
          if (prev === "picking" || prev === "reading" || prev === "importing" || prev === "refreshing") {
            importLog(opId, "finally-forced-idle", `was ${prev}`);
            return "idle";
          }
          return prev;
        });
      }
      releaseDataBusy();
    }
  }

  const exportLabel =
    exportStatus === "loading" ? "Exporting…"
    : exportStatus === "copied" ? "Copied!"
    : exportStatus === "error" && !exportFallbackJson ? "Export failed"
    : exportFallbackJson ? "Clipboard unavailable"
    : "Export to clipboard";

  const fileExportLabel =
    fileExportStatus === "loading" ? "Exporting…"
    : fileExportStatus === "saved" ? "File saved!"
    : fileExportStatus === "error" ? "Export failed"
    : "Export to file";

  const fileImportLabel =
    fileImportStatus === "picking"     ? "Picking file…"
    : fileImportStatus === "reading"   ? "Reading…"
    : fileImportStatus === "importing" ? "Importing…"
    : fileImportStatus === "refreshing" ? "Updating…"
    : fileImportStatus === "success"   ? "Imported!"
    : "Import from file";

  const fileImportBusy =
    fileImportStatus === "picking" ||
    fileImportStatus === "reading" ||
    fileImportStatus === "importing" ||
    fileImportStatus === "refreshing";

  const anyExportBusy = exportStatus === "loading" || fileExportStatus === "loading";
  const anyImportBusy = importStatus === "loading" || fileImportBusy;

  return (
    <div style={sectionStyle}>
      <h2 style={sectionTitleStyle}>Backup</h2>
      <div style={sectionCardStyle}>
        {/* Export row */}
        <div style={{ padding: "14px 18px", display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={rowBodyStyle}>
            <span style={rowLabelStyle}>Export backup</span>
            <span style={rowDescStyle}>
              Exports all exercises, sets, workouts, and session history as a single JSON backup.
              Use this to move your data to another device.
            </span>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              onClick={handleExport}
              disabled={anyExportBusy}
              style={{
                ...libBtnStyle,
                background: exportStatus === "copied" ? tokens.green : tokens.surfaceActive,
                color: exportStatus === "copied" ? tokens.greenText : tokens.textLight,
                border: `1px solid ${exportStatus === "copied" ? tokens.greenBorder : tokens.borderMedium}`,
                opacity: anyExportBusy && exportStatus !== "loading" ? 0.5 : 1,
              }}
            >
              {exportLabel}
            </button>
            <button
              onClick={handleFileExport}
              disabled={anyExportBusy}
              style={{
                ...libBtnStyle,
                background: fileExportStatus === "saved" ? tokens.green : tokens.surfaceActive,
                color: fileExportStatus === "saved" ? tokens.greenText : tokens.textLight,
                border: `1px solid ${fileExportStatus === "saved" ? tokens.greenBorder : tokens.borderMedium}`,
                opacity: anyExportBusy && fileExportStatus !== "loading" ? 0.5 : 1,
              }}
            >
              {fileExportLabel}
            </button>
          </div>
          {exportFallbackJson && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span style={{ fontSize: 12, color: tokens.amber }}>
                Clipboard copy failed. Select and copy the JSON below.
              </span>
              <textarea
                readOnly
                value={exportFallbackJson}
                rows={8}
                onFocus={(e) => e.target.select()}
                style={importTextareaStyle}
              />
            </div>
          )}
        </div>
        <div style={rowDividerStyle} />
        {/* Paste import row */}
        <div style={{ padding: "14px 18px", display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={rowBodyStyle}>
            <span style={rowLabelStyle}>Import backup</span>
            <span style={rowDescStyle}>
              Paste a previously exported JSON below, or pick a file. Existing items will be updated; new items will be added.
              Session history is merged. The import runs in a single transaction — any validation error rolls everything back.
            </span>
          </div>
          <textarea
            value={importText}
            onChange={(e) => {
              setImportText(e.target.value);
              if (importStatus !== "idle") { setImportStatus("idle"); setImportError(null); setImportResult(null); }
            }}
            placeholder="Paste exported JSON here…"
            rows={6}
            style={importTextareaStyle}
          />
          {importStatus === "success" && importResult && (
            <div style={importSuccessStyle}>
              Imported —{" "}
              exercises: +{importResult.exercises_created} / ↻{importResult.exercises_updated},{" "}
              sets: +{importResult.sets_created} / ↻{importResult.sets_updated},{" "}
              workouts: +{importResult.workouts_created} / ↻{importResult.workouts_updated},{" "}
              sessions: +{importResult.sessions_created} / ↻{importResult.sessions_updated}
            </div>
          )}
          {importStatus === "error" && importError && (
            <div style={importErrorStyle}>{importError}</div>
          )}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <button
              onClick={handleImport}
              disabled={anyImportBusy || isDataBusy || !importText.trim()}
              style={{ ...libBtnStyle, opacity: anyImportBusy || isDataBusy || !importText.trim() ? 0.5 : 1 }}
            >
              {importStatus === "loading" ? "Importing…" : "Import from clipboard"}
            </button>
            <button
              onClick={handleFileImport}
              disabled={anyImportBusy || isDataBusy}
              style={{ ...libBtnStyle, opacity: (anyImportBusy && !fileImportBusy) || (isDataBusy && !fileImportBusy) ? 0.5 : 1 }}
            >
              {fileImportLabel}
            </button>
            {fileImportBusy && (
              <button
                onClick={cancelFileImport}
                style={{ ...libBtnStyle, fontSize: 12, color: tokens.textSecondary, background: "transparent", border: "none", padding: "6px 6px" }}
              >
                Cancel
              </button>
            )}
          </div>
          {fileImportStatus === "success" && fileImportResult && (
            <div style={importSuccessStyle}>
              Imported from file —{" "}
              exercises: +{fileImportResult.exercises_created} / ↻{fileImportResult.exercises_updated},{" "}
              sets: +{fileImportResult.sets_created} / ↻{fileImportResult.sets_updated},{" "}
              workouts: +{fileImportResult.workouts_created} / ↻{fileImportResult.workouts_updated},{" "}
              sessions: +{fileImportResult.sessions_created} / ↻{fileImportResult.sessions_updated}
            </div>
          )}
          {fileImportStatus === "error" && fileImportError && (
            <div style={importErrorStyle}>{fileImportError}</div>
          )}
        </div>
      </div>
    </div>
  );
}

type DangerAction = "reset" | "clear" | null;

function DangerZoneSection() {
  const queryClient = useQueryClient();
  const clearSession = useSessionStore((s) => s.clear);
  const { isDataBusy, tryAcquire, releaseDataBusy } = useDataOp();
  const [confirming, setConfirming] = useState<DangerAction>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  function openConfirm(action: DangerAction) { setError(null); setSuccessMsg(null); setConfirming(action); }
  function closeConfirm() { if (!loading) { setConfirming(null); setError(null); } }

  async function handleReset() {
    if (!tryAcquire()) return;
    setLoading(true);
    setError(null);
    try {
      await libraryApi.resetLocalData();
      clearSession();
      removeAllAppDataQueries(queryClient);
      await hydrateCoreLists(queryClient);
      setConfirming(null);
      setSuccessMsg("Data reset and default library restored.");
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
      releaseDataBusy();
    }
  }

  async function handleClear() {
    if (!tryAcquire()) return;
    setLoading(true);
    setError(null);
    try {
      await libraryApi.clearLocalData();
      clearSession();
      removeAllAppDataQueries(queryClient);
      setConfirming(null);
      setSuccessMsg("Data cleared. Defaults will load on next launch.");
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
      releaseDataBusy();
    }
  }

  return (
    <div style={sectionStyle}>
      <h2 style={sectionTitleStyle}>Danger Zone</h2>
      <div style={sectionCardStyle}>
        <div style={{ padding: "14px 18px", display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={rowBodyStyle}>
            <span style={rowLabelStyle}>Reset to default library</span>
            <span style={rowDescStyle}>
              Deletes all local data and immediately restores the bundled default library.
            </span>
          </div>
          <button
            onClick={() => openConfirm("reset")}
            disabled={isDataBusy}
            style={{ ...libBtnStyle, ...resetBtnStyle, alignSelf: "flex-start", opacity: isDataBusy ? 0.45 : 1 }}
          >
            Reset to default library…
          </button>
        </div>
        <div style={rowDividerStyle} />
        <div style={{ padding: "14px 18px", display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={rowBodyStyle}>
            <span style={rowLabelStyle}>Clear local data</span>
            <span style={rowDescStyle}>
              Deletes all local data and leaves the app empty for this session.
              The bundled default library will load again on next launch.
            </span>
          </div>
          <button
            onClick={() => openConfirm("clear")}
            disabled={isDataBusy}
            style={{ ...libBtnStyle, ...resetBtnStyle, alignSelf: "flex-start", opacity: isDataBusy ? 0.45 : 1 }}
          >
            Clear local data…
          </button>
        </div>
      </div>
      {successMsg && <div style={{ ...importSuccessStyle, marginTop: 10 }}>{successMsg}</div>}
      {confirming === "reset" && (
        <ConfirmModal
          title="Reset to default library?"
          message="This will permanently delete all exercises, set templates, workout templates, and session history, then immediately restore the bundled default library. This action cannot be undone."
          confirmLabel="Reset to defaults"
          destructive
          loading={loading}
          error={error}
          onConfirm={handleReset}
          onCancel={closeConfirm}
        />
      )}
      {confirming === "clear" && (
        <ConfirmModal
          title="Clear all local data?"
          message="This will permanently delete all exercises, set templates, workout templates, and session history. The app will be empty for this session. The bundled default library will load again on next launch."
          confirmLabel="Clear everything"
          destructive
          loading={loading}
          error={error}
          onConfirm={handleClear}
          onCancel={closeConfirm}
        />
      )}
    </div>
  );
}

function DataCategoryView() {
  return (
    <>
      <LibrarySection />
      <DangerZoneSection />
    </>
  );
}

// ── Left panel: category card ─────────────────────────────────────────────────

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

// ── Page root ─────────────────────────────────────────────────────────────────

export default function Settings() {
  const navigate = useNavigate();
  const [category, setCategory] = useState<SettingsCategory>("appearance");

  const dataBusyRef = useRef(false);
  const [isDataBusy, setIsDataBusy] = useState(false);
  const tryAcquire = useCallback(() => {
    if (dataBusyRef.current) return false;
    dataBusyRef.current = true;
    setIsDataBusy(true);
    return true;
  }, []);
  const releaseDataBusy = useCallback(() => {
    dataBusyRef.current = false;
    setIsDataBusy(false);
  }, []);

  return (
    <DataOpContext.Provider value={{ isDataBusy, tryAcquire, releaseDataBusy }}>
      <div style={rootStyle}>

        {/* ── Left panel ── */}
        <div style={leftPanelStyle}>
          <div style={leftHeaderStyle}>
            <button onClick={() => navigate("/")} style={backBtnStyle}>← Back</button>
            <h1 style={pageTitleStyle}>Settings</h1>
            <p style={pageSubtitleStyle}>Customize your experience.</p>
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
          <div style={detailScrollStyle}>
            {category === "appearance" && <AppearanceCategoryView />}
            {category === "runner"     && <RunnerCategoryView />}
            {category === "sound"      && <SoundCategoryView />}
            {category === "data"       && <DataCategoryView />}
          </div>
        </div>

      </div>
    </DataOpContext.Provider>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

// Root / layout

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
  padding: "14px 20px 10px",
  flexShrink: 0,
  borderBottom: `1px solid ${DIVIDER}`,
};

const listStyle: React.CSSProperties = {
  flex: 1,
  overflowY: "auto",
  padding: "8px 0",
};

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
  padding: "24px 32px 48px",
};

// Left panel elements

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

// Section / row primitives (used by all category views)

const sectionStyle: React.CSSProperties = {
  marginBottom: 28,
};

const sectionTitleStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  color: tokens.textSecondary,
  margin: "0 0 8px 4px",
};

const sectionCardStyle: React.CSSProperties = {
  background: tokens.card,
  border: `1px solid ${tokens.borderSubtle}`,
  borderRadius: 14,
  overflow: "hidden",
};

const rowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 16,
  padding: "14px 18px",
};

const rowBodyStyle: React.CSSProperties = {
  flex: 1,
  display: "flex",
  flexDirection: "column",
  gap: 3,
  minWidth: 0,
};

const rowLabelStyle: React.CSSProperties = {
  fontSize: 15,
  fontWeight: 500,
  color: tokens.textPrimary,
};

const rowDescStyle: React.CSSProperties = {
  fontSize: 12,
  color: tokens.textSecondary,
  lineHeight: 1.4,
};

const rowControlStyle: React.CSSProperties = {
  flexShrink: 0,
};

const rowDividerStyle: React.CSSProperties = {
  height: 1,
  background: tokens.divider,
  margin: "0 18px",
};

const comingSoonStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: "0.04em",
  textTransform: "uppercase",
  color: tokens.textMuted,
  background: tokens.cardSubtle,
  border: `1px solid ${tokens.border}`,
  borderRadius: 5,
  padding: "3px 8px",
};

const sliderValueStyle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  fontVariantNumeric: "tabular-nums",
  color: tokens.textSecondary,
  minWidth: 38,
  textAlign: "right",
};

const previewBtnStyle: React.CSSProperties = {
  padding: "5px 14px",
  borderRadius: 7,
  border: `1px solid ${tokens.borderMedium}`,
  background: tokens.surfaceActive,
  color: tokens.textLight,
  cursor: "pointer",
  fontSize: 13,
  fontWeight: 600,
};

const libBtnStyle: React.CSSProperties = {
  padding: "6px 14px",
  borderRadius: 7,
  border: `1px solid ${tokens.borderMedium}`,
  background: tokens.surfaceActive,
  color: tokens.textLight,
  cursor: "pointer",
  fontSize: 13,
  fontWeight: 600,
  transition: "background 0.12s, color 0.12s, border-color 0.12s",
};

const importTextareaStyle: React.CSSProperties = {
  background: tokens.cardSubtle,
  border: `1px solid ${tokens.border}`,
  borderRadius: 8,
  color: tokens.textPrimary,
  fontSize: 12,
  fontFamily: "monospace",
  padding: "10px 12px",
  resize: "vertical",
  outline: "none",
};

const importSuccessStyle: React.CSSProperties = {
  fontSize: 12,
  color: tokens.greenBadgeText,
  background: tokens.green,
  border: `1px solid ${tokens.greenBorder}`,
  borderRadius: 7,
  padding: "7px 12px",
};

const importErrorStyle: React.CSSProperties = {
  fontSize: 12,
  color: tokens.textPrimary,
  background: tokens.cardSubtle,
  border: `1px solid ${tokens.borderStrong}`,
  borderRadius: 7,
  padding: "7px 12px",
  wordBreak: "break-word",
};

const resetBtnStyle: React.CSSProperties = {
  background: tokens.redBg,
  border: `1px solid ${tokens.redBorder}`,
  color: tokens.red,
};
