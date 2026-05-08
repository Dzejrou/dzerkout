import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { exercisesApi } from "../../api/exercises";
import { setTemplatesApi } from "../../api/setTemplates";
import type { Exercise, ExerciseMeta, ExerciseMuscleInput, ExerciseSearchFilters } from "../../types/exercise";
import {
  EXERCISE_CATEGORIES, EXERCISE_EQUIPMENT, EXERCISE_LEVELS,
  EXERCISE_MUSCLES, EXERCISE_TAGS, EXERCISE_FORCES,
  EXERCISE_POSE_TYPES,
} from "../../types/exercise";
import ExerciseForm from "./ExerciseForm";
import { ConfirmModal } from "../../components/ConfirmModal";

import { tokens } from "../../theme/tokens";
const { bg: BG, card: CARD, divider: DIVIDER, textPrimary: TEXT_PRIMARY, textSecondary: TEXT_SECONDARY, border: BORDER, bgElevated: BG_ELEVATED, surfaceSelected: SURFACE_SELECTED, surfaceActive: SURFACE_ACTIVE, borderStrong: BORDER_STRONG, textLight: TEXT_LIGHT } = tokens;

type Modal =
  | { type: "create" }
  | { type: "edit"; exercise: Exercise }
  | { type: "delete"; exercise: Exercise; refs: number }
  | { type: "addToSet"; exercise: Exercise };

function formatDateFull(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit",
  });
}

function DetailPane({
  exercise,
  onEdit,
  onDelete,
  onAddToSet,
}: {
  exercise: Exercise;
  onEdit: () => void;
  onDelete: () => void;
  onAddToSet: () => void;
}) {
  const hasMuscles = exercise.primary_muscles.length > 0 || exercise.secondary_muscles.length > 0;
  const hasMetaRow =
    exercise.category || exercise.equipment || exercise.level ||
    exercise.mechanic || exercise.force;

  let instructions: string[] | null = null;
  if (exercise.instructions_json) {
    try {
      instructions = JSON.parse(exercise.instructions_json) as string[];
    } catch {
      // ignore
    }
  }

  return (
    <div style={detailRootStyle}>
      {/* Header */}
      <div style={detailHeaderStyle}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 style={detailTitleStyle}>{exercise.name}</h1>
          {exercise.sanskrit_name && (
            <div style={detailSanskritStyle}>{exercise.sanskrit_name}</div>
          )}
          {exercise.is_catalog && (
            <span style={catalogBadgeDetailStyle}>Catalog</span>
          )}
        </div>
        <div style={{ display: "flex", gap: 8, flexShrink: 0, flexWrap: "wrap", justifyContent: "flex-end" }}>
          <button onClick={onAddToSet} style={addToSetBtnStyle}>
            <span style={{ marginRight: 5 }}>+</span>Add to set
          </button>
          <button onClick={onEdit} style={editBtnStyle}>
            <span style={{ marginRight: 5 }}>✏</span>Edit
          </button>
          <button onClick={onDelete} style={deleteBtnStyle}>
            <span style={{ marginRight: 5 }}>🗑</span>Delete
          </button>
        </div>
      </div>

      <div style={detailDividerStyle} />

      {/* Tags section */}
      <section style={detailSectionStyle}>
        <h2 style={sectionHeadingStyle}>Tags</h2>
        {exercise.tags.length > 0 ? (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {exercise.tags.map((t) => (
              <span key={t} style={detailTagChipStyle}>{t}</span>
            ))}
          </div>
        ) : (
          <span style={detailTagChipStyle}>unspecified</span>
        )}
      </section>
      <div style={detailDividerStyle} />

      {/* Notes section */}
      {exercise.notes && (
        <>
          <section style={detailSectionStyle}>
            <h2 style={sectionHeadingStyle}>Notes</h2>
            <p style={notesTextStyle}>{exercise.notes}</p>
          </section>
          <div style={detailDividerStyle} />
        </>
      )}

      {/* Pose types section */}
      {exercise.pose_types.length > 0 && (
        <>
          <section style={detailSectionStyle}>
            <h2 style={sectionHeadingStyle}>Pose types</h2>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {exercise.pose_types.map((pt) => (
                <span key={pt} style={detailTagChipStyle}>{pt.replace(/_/g, " ")}</span>
              ))}
            </div>
          </section>
          <div style={detailDividerStyle} />
        </>
      )}

      {/* Muscles section */}
      {hasMuscles && (
        <>
          <section style={detailSectionStyle}>
            <h2 style={sectionHeadingStyle}>Muscles</h2>
            {exercise.primary_muscles.length > 0 && (
              <div style={{ marginBottom: 8 }}>
                <span style={muscleLabelStyle}>Primary</span>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 4 }}>
                  {exercise.primary_muscles.map((m) => (
                    <span key={m} style={muscleChipPrimaryStyle}>{m}</span>
                  ))}
                </div>
              </div>
            )}
            {exercise.secondary_muscles.length > 0 && (
              <div>
                <span style={muscleLabelStyle}>Secondary</span>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 4 }}>
                  {exercise.secondary_muscles.map((m) => (
                    <span key={m} style={muscleChipSecondaryStyle}>{m}</span>
                  ))}
                </div>
              </div>
            )}
          </section>
          <div style={detailDividerStyle} />
        </>
      )}

      {/* Instructions section */}
      {instructions && instructions.length > 0 && (
        <>
          <section style={detailSectionStyle}>
            <h2 style={sectionHeadingStyle}>Instructions</h2>
            <ol style={instructionsListStyle}>
              {instructions.map((step, i) => (
                <li key={i} style={instructionItemStyle}>{step}</li>
              ))}
            </ol>
          </section>
          <div style={detailDividerStyle} />
        </>
      )}

      {/* Details section */}
      <section style={detailSectionStyle}>
        <h2 style={sectionHeadingStyle}>Details</h2>
        <div style={detailRowsStyle}>
          {hasMetaRow && (
            <>
              {exercise.category && (
                <DetailRow icon="🏷" label="Category" value={exercise.category} />
              )}
              {exercise.equipment && (
                <DetailRow icon="🏋" label="Equipment" value={exercise.equipment} />
              )}
              {exercise.level && (
                <DetailRow icon="📊" label="Level" value={exercise.level} />
              )}
              {exercise.mechanic && (
                <DetailRow icon="⚙" label="Mechanic" value={exercise.mechanic} />
              )}
              {exercise.force && (
                <DetailRow icon="↕" label="Force" value={exercise.force} />
              )}
            </>
          )}
          {exercise.is_catalog && exercise.catalog_source && (
            <>
              <DetailRow icon="📦" label="Source" value={exercise.catalog_source} />
              {exercise.catalog_id && (
                <DetailRow icon="#" label="Catalog ID" value={exercise.catalog_id} />
              )}
            </>
          )}
          <DetailRow icon="📅" label="Created" value={formatDateFull(exercise.created_at)} />
          <DetailRow icon="✏" label="Last updated" value={formatDateFull(exercise.updated_at)} />
        </div>
        {exercise.is_catalog && (
          <p style={catalogDetailNoteStyle}>
            Catalog exercise — local edits are saved but may be overwritten if this catalog is re-imported.
          </p>
        )}
      </section>
    </div>
  );
}

function DetailRow({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div style={detailRowStyle}>
      <span style={detailRowIconStyle}>{icon}</span>
      <span style={detailRowLabelStyle}>{label}</span>
      <span style={detailRowValueStyle}>{value}</span>
    </div>
  );
}

function FilterSelect({
  value,
  onChange,
  placeholder,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  options: readonly string[];
}) {
  const active = !!value;
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{
        ...filterSelectStyle,
        border: `1px solid ${active ? tokens.greenBadgeBorder : BORDER}`,
        color: active ? TEXT_PRIMARY : TEXT_SECONDARY,
      }}
    >
      <option value="">{placeholder}</option>
      {options.map((v) => (
        <option key={v} value={v}>{v}</option>
      ))}
    </select>
  );
}

function AddToSetModal({
  exercise,
  onClose,
  onAdded,
}: {
  exercise: Exercise;
  onClose: () => void;
  onAdded: (setName: string) => void;
}) {
  const qc = useQueryClient();
  const { data: sets = [], isLoading } = useQuery({
    queryKey: ["set-templates"],
    queryFn: () => setTemplatesApi.list(),
  });
  // Library sets only — list_set_templates already filters out workout-local
  // (forked) sets at the SQL layer, but make the intent explicit here.
  const librarySets = sets.filter((s) => s.owning_workout_template_id == null);

  const [setId, setSetId] = useState("");
  const [durationStr, setDurationStr] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!setId && librarySets.length > 0) setSetId(librarySets[0].id);
  }, [librarySets, setId]);

  const addMut = useMutation({
    mutationFn: (params: {
      setId: string;
      durationHintSec: number | null;
      notes: string | null;
    }) =>
      setTemplatesApi.addCard({
        setId: params.setId,
        cardType: "concrete",
        exerciseId: exercise.id,
        durationHintSec: params.durationHintSec,
        notes: params.notes,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["set-templates"] });
      qc.invalidateQueries({ queryKey: ["set-template", setId] });
      const target = librarySets.find((s) => s.id === setId);
      onAdded(target?.name ?? "set");
      onClose();
    },
    onError: (e) => setError(String(e)),
  });

  function onSubmit() {
    setError(null);
    if (!setId) {
      setError("Choose a set.");
      return;
    }
    let durationHintSec: number | null = null;
    if (durationStr.trim() !== "") {
      const n = Number(durationStr);
      if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) {
        setError("Duration must be a positive whole number of seconds.");
        return;
      }
      durationHintSec = n;
    }
    const trimmedNotes = notes.trim();
    addMut.mutate({
      setId,
      durationHintSec,
      notes: trimmedNotes === "" ? null : trimmedNotes,
    });
  }

  return (
    <div style={overlayStyle}>
      <div style={modalStyle}>
        <h3 style={modalTitleStyle}>Add to set</h3>

        <div style={addToSetSubtitleStyle}>
          <span style={{ color: TEXT_SECONDARY, fontSize: 12 }}>Exercise:</span>{" "}
          <strong style={{ color: TEXT_PRIMARY, fontSize: 14 }}>{exercise.name}</strong>
        </div>

        {isLoading ? (
          <p style={{ color: TEXT_SECONDARY, fontSize: 13, margin: "16px 0" }}>Loading sets…</p>
        ) : librarySets.length === 0 ? (
          <p style={addToSetEmptyStyle}>
            No sets yet. Create a set first in the Sets page.
          </p>
        ) : (
          <>
            <div style={{ marginBottom: 12 }}>
              <label style={addToSetLabelStyle}>Target set</label>
              <select
                value={setId}
                onChange={(e) => setSetId(e.target.value)}
                style={addToSetSelectStyle}
              >
                {librarySets.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.card_count} card{s.card_count === 1 ? "" : "s"})
                  </option>
                ))}
              </select>
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={addToSetLabelStyle}>
                Duration hint{" "}
                <span style={{ color: tokens.textMuted, fontWeight: 400, fontSize: 11 }}>
                  optional, seconds
                </span>
              </label>
              <input
                type="number"
                min={1}
                value={durationStr}
                onChange={(e) => setDurationStr(e.target.value)}
                placeholder="e.g. 45"
                style={addToSetInputStyle}
              />
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={addToSetLabelStyle}>
                Notes{" "}
                <span style={{ color: tokens.textMuted, fontWeight: 400, fontSize: 11 }}>
                  optional
                </span>
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Cue for this card"
                style={{ ...addToSetInputStyle, height: 60, resize: "vertical" }}
              />
            </div>
          </>
        )}

        {error && <p style={addToSetErrorStyle}>{error}</p>}

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 6 }}>
          <button
            type="button"
            onClick={onClose}
            disabled={addMut.isPending}
            style={modalCancelBtnStyle}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onSubmit}
            disabled={librarySets.length === 0 || addMut.isPending || !setId}
            style={{
              ...modalConfirmBtnStyle,
              opacity: librarySets.length === 0 || addMut.isPending || !setId ? 0.5 : 1,
              cursor:
                librarySets.length === 0 || addMut.isPending || !setId ? "not-allowed" : "pointer",
            }}
          >
            {addMut.isPending ? "Adding…" : "Add"}
          </button>
        </div>
      </div>
    </div>
  );
}

function EmptyState({ isFiltered }: { isFiltered: boolean }) {
  return (
    <div style={emptyDetailStyle}>
      <p style={{ color: TEXT_SECONDARY, fontSize: 15 }}>
        {isFiltered
          ? "No exercises match your filters."
          : "No exercises yet. Create one to get started."}
      </p>
    </div>
  );
}

const PAGE_SIZE = 50;

export default function ExerciseLibrary() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedExercise, setSelectedExercise] = useState<Exercise | null>(null);
  const [page, setPage] = useState(0);
  const [modal, setModal] = useState<Modal | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!toastMessage) return;
    const t = setTimeout(() => setToastMessage(null), 2400);
    return () => clearTimeout(t);
  }, [toastMessage]);

  const [filterCategory, setFilterCategory] = useState("");
  const [filterEquipment, setFilterEquipment] = useState("");
  const [filterLevel, setFilterLevel] = useState("");
  const [filterMuscle, setFilterMuscle] = useState("");
  const [filterTag, setFilterTag] = useState("");
  const [filterForce, setFilterForce] = useState("");
  const [filterPoseType, setFilterPoseType] = useState("");
  const [filterCatalogSource, setFilterCatalogSource] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);

  const activeFilterCount = [
    filterCategory, filterEquipment, filterLevel, filterMuscle,
    filterTag, filterForce, filterPoseType, filterCatalogSource,
  ].filter(Boolean).length;

  // Reset to page 0 whenever any search/filter value changes.
  useEffect(() => { setPage(0); }, [search, filterCategory, filterEquipment, filterLevel, filterMuscle, filterForce, filterTag, filterPoseType, filterCatalogSource]);

  const searchFilters: ExerciseSearchFilters = useMemo(() => ({
    query: search || undefined,
    source: filterCatalogSource === "local" ? "user" : filterCatalogSource ? "catalog" : undefined,
    catalog_source: filterCatalogSource && filterCatalogSource !== "local" ? filterCatalogSource : undefined,
    category: filterCategory || undefined,
    equipment: filterEquipment || undefined,
    level: filterLevel || undefined,
    primary_muscle: filterMuscle || undefined,
    force: filterForce || undefined,
    tag: filterTag || undefined,
    pose_type: filterPoseType || undefined,
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
  }), [search, filterCatalogSource, filterCategory, filterEquipment, filterLevel, filterMuscle, filterForce, filterTag, filterPoseType, page]);

  const { data: catalogSources = [] } = useQuery({
    queryKey: ["exercises", "catalog-sources"],
    queryFn: () => exercisesApi.listCatalogSources(),
  });

  const { data: searchResult, isLoading } = useQuery({
    queryKey: ["exercises", "search", searchFilters],
    queryFn: () => exercisesApi.search(searchFilters),
  });

  const filtered = searchResult?.exercises ?? [];
  const totalCount = searchResult?.total ?? 0;

  function clearFilters() {
    setFilterCategory("");
    setFilterEquipment("");
    setFilterLevel("");
    setFilterMuscle("");
    setFilterTag("");
    setFilterForce("");
    setFilterPoseType("");
    setFilterCatalogSource("");
  }

  // Auto-select first exercise when nothing is selected (initial load or after clearing).
  useEffect(() => {
    if (selectedId === null && filtered.length > 0) {
      setSelectedId(filtered[0].id);
      setSelectedExercise(filtered[0]);
    }
  }, [filtered, selectedId]);

  // When the user selects an exercise from the current page, cache it so the
  // detail pane stays visible even after paging to a different page.
  const selectedInPage = filtered.find((e) => e.id === selectedId) ?? null;
  const displayedExercise = selectedInPage ?? selectedExercise;

  const invalidateExercises = () => qc.invalidateQueries({ queryKey: ["exercises"] });

  const createMut = useMutation({
    mutationFn: ({
      name, notes, tags, meta, muscles, poseTypes,
    }: {
      name: string; notes: string | null; tags: string[];
      meta: ExerciseMeta; muscles: ExerciseMuscleInput[]; poseTypes: string[];
    }) => exercisesApi.create(name, notes, tags, meta, muscles, poseTypes),
    onSuccess: (created) => {
      invalidateExercises();
      setSelectedId(created.id);
      setSelectedExercise(created);
      setModal(null);
    },
  });

  const updateMut = useMutation({
    mutationFn: ({
      id, name, notes, tags, meta, muscles, poseTypes,
    }: {
      id: string; name: string; notes: string | null; tags: string[];
      meta: ExerciseMeta; muscles: ExerciseMuscleInput[]; poseTypes: string[];
    }) => exercisesApi.update(id, name, notes, tags, meta, muscles, poseTypes),
    onSuccess: () => { invalidateExercises(); setModal(null); },
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => exercisesApi.delete(id, true),
    onSuccess: () => {
      invalidateExercises();
      qc.invalidateQueries({ queryKey: ["set-templates"] });
      setModal(null);
    },
    onError: (e) => setDeleteError(String(e)),
  });

  async function handleDeleteClick(ex: Exercise) {
    setDeleteError(null);
    const refs = await exercisesApi.getReferences(ex.id);
    setModal({ type: "delete", exercise: ex, refs: refs.cards.length });
  }

  return (
    <div style={rootStyle}>
      {/* ── Left panel ── */}
      <div style={leftPanelStyle}>
        <div style={leftHeaderStyle}>
          <button onClick={() => navigate("/")} style={backBtnStyle}>← Back</button>
          <div style={titleRowStyle}>
            <h1 style={pageTitleStyle}>Exercises</h1>
            <button
              onClick={() => setModal({ type: "create" })}
              style={newBtnCompactStyle}
              title="New exercise"
              aria-label="New exercise"
            >
              +
            </button>
          </div>

          <div style={searchWrapStyle}>
            <span style={searchIconStyle}>⌕</span>
            <input
              type="text"
              placeholder="Search exercises…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={searchInputStyle}
            />
          </div>

          {/* Filters toggle row */}
          <div style={filterToggleRowStyle}>
            <button
              onClick={() => setFiltersOpen((v) => !v)}
              style={{
                ...filterToggleBtnStyle,
                color: activeFilterCount > 0 ? tokens.greenBadgeText : TEXT_SECONDARY,
                background: activeFilterCount > 0 ? tokens.greenBadgeBg : "transparent",
                border: `1px solid ${activeFilterCount > 0 ? tokens.greenBadgeBorder : BORDER}`,
              }}
            >
              {filtersOpen ? "▾" : "▸"} Filters
              {activeFilterCount > 0 && ` (${activeFilterCount})`}
            </button>
            {activeFilterCount > 0 && (
              <button onClick={clearFilters} style={clearFiltersBtnStyle}>Clear</button>
            )}
          </div>

          {/* Filter selects */}
          {filtersOpen && (
            <div style={filtersGridStyle}>
              <FilterSelect
                value={filterCategory}
                onChange={setFilterCategory}
                placeholder="Category"
                options={EXERCISE_CATEGORIES}
              />
              <FilterSelect
                value={filterEquipment}
                onChange={setFilterEquipment}
                placeholder="Equipment"
                options={EXERCISE_EQUIPMENT}
              />
              <FilterSelect
                value={filterLevel}
                onChange={setFilterLevel}
                placeholder="Level"
                options={EXERCISE_LEVELS}
              />
              <FilterSelect
                value={filterMuscle}
                onChange={setFilterMuscle}
                placeholder="Muscle"
                options={EXERCISE_MUSCLES}
              />
              <FilterSelect
                value={filterForce}
                onChange={setFilterForce}
                placeholder="Force"
                options={EXERCISE_FORCES}
              />
              <FilterSelect
                value={filterTag}
                onChange={setFilterTag}
                placeholder="Tag"
                options={EXERCISE_TAGS}
              />
              <FilterSelect
                value={filterPoseType}
                onChange={setFilterPoseType}
                placeholder="Pose type"
                options={EXERCISE_POSE_TYPES}
              />
              <select
                value={filterCatalogSource}
                onChange={(e) => setFilterCatalogSource(e.target.value)}
                style={{
                  ...filterSelectStyle,
                  border: `1px solid ${filterCatalogSource ? tokens.greenBadgeBorder : BORDER}`,
                  color: filterCatalogSource ? TEXT_PRIMARY : TEXT_SECONDARY,
                }}
              >
                <option value="">Any source</option>
                <option value="local">Local</option>
                {catalogSources.map((cs) => (
                  <option key={cs.source} value={cs.source}>
                    {cs.source} ({cs.count})
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        <div style={listStyle}>
          {isLoading && <p style={{ color: TEXT_SECONDARY, padding: "16px 20px" }}>Loading…</p>}
          {!isLoading && filtered.length === 0 && (
            <p style={{ color: TEXT_SECONDARY, padding: "16px 20px", textAlign: "center" }}>
              {search || activeFilterCount > 0 ? "No matches" : "No exercises yet"}
            </p>
          )}
          {filtered.map((ex) => {
            const isSelected = ex.id === selectedId;
            return (
              <button
                key={ex.id}
                onClick={() => { setSelectedId(ex.id); setSelectedExercise(ex); }}
                style={{
                  ...exerciseRowStyle,
                  background: isSelected ? SURFACE_SELECTED : "transparent",
                  borderLeft: isSelected ? `2px solid ${tokens.greenBadgeText}` : "2px solid transparent",
                }}
              >
                <div style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
                  <div style={exNameStyle}>{ex.name}</div>
                  {ex.sanskrit_name && (
                    <div style={exSanskritStyle}>{ex.sanskrit_name}</div>
                  )}
                  <div style={exTagsRowStyle}>
                    {ex.is_catalog && (
                      <span style={catalogBadgeStyle}>Catalog</span>
                    )}
                    {ex.tags.map((t) => (
                      <span key={t} style={exTagChipStyle}>{t}</span>
                    ))}
                    {!ex.is_catalog && ex.tags.length === 0 && ex.notes && (
                      <span style={exNotesStyle}>{ex.notes}</span>
                    )}
                  </div>
                </div>
                <span style={chevronStyle}>›</span>
              </button>
            );
          })}
          {totalCount > 0 && (
            <div style={pagingFooterStyle}>
              <span style={pagingInfoStyle}>
                {`${page * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE + filtered.length, totalCount)} of ${totalCount}`}
              </span>
              <div style={{ display: "flex", gap: 4 }}>
                <button
                  onClick={() => setPage((p) => p - 1)}
                  disabled={page === 0}
                  style={pagingBtnStyle(page === 0)}
                >
                  ‹ Prev
                </button>
                <button
                  onClick={() => setPage((p) => p + 1)}
                  disabled={page * PAGE_SIZE + filtered.length >= totalCount}
                  style={pagingBtnStyle(page * PAGE_SIZE + filtered.length >= totalCount)}
                >
                  Next ›
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Right panel ── */}
      <div style={rightPanelStyle}>
        {displayedExercise ? (
          <DetailPane
            exercise={displayedExercise}
            onEdit={() => setModal({ type: "edit", exercise: displayedExercise })}
            onDelete={() => handleDeleteClick(displayedExercise)}
            onAddToSet={() => setModal({ type: "addToSet", exercise: displayedExercise })}
          />
        ) : (
          <EmptyState isFiltered={!!search || activeFilterCount > 0} />
        )}
      </div>

      {/* Create / Edit modal */}
      {(modal?.type === "create" || modal?.type === "edit") && (
        <div style={overlayStyle}>
          <div style={modalStyle}>
            <h3 style={modalTitleStyle}>
              {modal.type === "create" ? "New exercise" : "Edit exercise"}
            </h3>
            <ExerciseForm
              initial={modal.type === "edit" ? modal.exercise : undefined}
              saving={createMut.isPending || updateMut.isPending}
              onCancel={() => setModal(null)}
              onSave={(name, notes, tags, meta, muscles, poseTypes) => {
                if (modal.type === "create") {
                  createMut.mutate({ name, notes, tags, meta, muscles, poseTypes });
                } else {
                  updateMut.mutate({
                    id: modal.exercise.id,
                    name, notes, tags, meta, muscles, poseTypes,
                  });
                }
              }}
            />
          </div>
        </div>
      )}

      {/* Add to set modal */}
      {modal?.type === "addToSet" && (
        <AddToSetModal
          exercise={modal.exercise}
          onClose={() => setModal(null)}
          onAdded={(setName) => setToastMessage(`Added to "${setName}"`)}
        />
      )}

      {/* Transient success toast */}
      {toastMessage && <div style={toastStyle}>{toastMessage}</div>}

      {/* Delete confirm */}
      {modal?.type === "delete" && (
        <ConfirmModal
          title={`Delete "${modal.exercise.name}"?`}
          message={
            modal.exercise.is_catalog
              ? modal.refs > 0
                ? `This catalog exercise is used in ${modal.refs} card(s). Cards will become placeholders. It will be removed from your local library.`
                : "This catalog exercise will be removed from your local library."
              : modal.refs > 0
                ? `This exercise is used in ${modal.refs} card(s). Cards will become placeholders.`
                : "This exercise will be permanently deleted."
          }
          confirmLabel="Delete"
          destructive
          loading={deleteMut.isPending}
          error={deleteError}
          onConfirm={() => deleteMut.mutate(modal.exercise.id)}
          onCancel={() => setModal(null)}
        />
      )}
    </div>
  );
}

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

const titleRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  marginBottom: 8,
};

const pageTitleStyle: React.CSSProperties = {
  fontSize: 34,
  fontWeight: 800,
  margin: 0,
  letterSpacing: "-0.02em",
  color: TEXT_PRIMARY,
};

const newBtnCompactStyle: React.CSSProperties = {
  flexShrink: 0,
  width: 34,
  height: 34,
  borderRadius: 8,
  border: "none",
  background: tokens.green,
  color: "#fff",
  cursor: "pointer",
  fontSize: 22,
  fontWeight: 400,
  lineHeight: "34px",
  textAlign: "center",
  padding: 0,
};

const searchWrapStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  background: CARD,
  border: `1px solid ${BORDER}`,
  borderRadius: 8,
  padding: "6px 10px",
  overflow: "hidden",
};

const searchIconStyle: React.CSSProperties = {
  fontSize: 16,
  color: TEXT_SECONDARY,
  flexShrink: 0,
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

const listStyle: React.CSSProperties = {
  flex: 1,
  overflowY: "auto",
  padding: "8px 0",
};

const exerciseRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  width: "100%",
  padding: "14px 20px",
  boxSizing: "border-box",
  gap: 12,
  background: "transparent",
  border: "none",
  borderBottom: `1px solid ${DIVIDER}`,
  cursor: "pointer",
  transition: "background 0.1s",
  color: TEXT_PRIMARY,
};

const exNameStyle: React.CSSProperties = {
  fontSize: 16,
  fontWeight: 600,
  color: TEXT_PRIMARY,
  marginBottom: 2,
};

const exSanskritStyle: React.CSSProperties = {
  fontSize: 11,
  fontStyle: "italic",
  color: TEXT_SECONDARY,
  marginTop: 1,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const exNotesStyle: React.CSSProperties = {
  fontSize: 13,
  color: TEXT_SECONDARY,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const exTagsRowStyle: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 4,
  marginTop: 4,
};

const exTagChipStyle: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 600,
  letterSpacing: "0.04em",
  textTransform: "uppercase",
  color: tokens.blue,
  background: tokens.blueBadgeBg,
  border: `1px solid ${tokens.blueBadgeBorder}`,
  borderRadius: 4,
  padding: "1px 6px",
};

const detailTagChipStyle: React.CSSProperties = {
  display: "inline-block",
  fontSize: 12,
  fontWeight: 600,
  letterSpacing: "0.04em",
  textTransform: "uppercase",
  color: tokens.blue,
  background: tokens.blueBadgeBg,
  border: `1px solid ${tokens.blueBadgeBorder}`,
  borderRadius: 5,
  padding: "3px 8px",
};

const chevronStyle: React.CSSProperties = {
  fontSize: 20,
  color: TEXT_SECONDARY,
  flexShrink: 0,
  lineHeight: 1,
};

const pagingFooterStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "8px 16px",
  borderTop: `1px solid ${DIVIDER}`,
};

const pagingInfoStyle: React.CSSProperties = {
  fontSize: 11,
  color: TEXT_SECONDARY,
};

function pagingBtnStyle(disabled: boolean): React.CSSProperties {
  return {
    fontSize: 12,
    fontWeight: 500,
    padding: "4px 10px",
    borderRadius: 6,
    border: `1px solid ${BORDER}`,
    background: "transparent",
    color: disabled ? TEXT_SECONDARY : TEXT_PRIMARY,
    cursor: disabled ? "default" : "pointer",
    opacity: disabled ? 0.4 : 1,
  };
}

const rightPanelStyle: React.CSSProperties = {
  flex: 1,
  background: BG_ELEVATED,
  overflowY: "auto",
};

const detailRootStyle: React.CSSProperties = {
  padding: "28px 32px",
};

const detailHeaderStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  gap: 16,
  marginBottom: 20,
};

const detailTitleStyle: React.CSSProperties = {
  fontSize: 34,
  fontWeight: 800,
  margin: "0 0 4px",
  letterSpacing: "-0.02em",
  color: TEXT_PRIMARY,
};

const detailSanskritStyle: React.CSSProperties = {
  fontSize: 14,
  fontStyle: "italic",
  color: TEXT_SECONDARY,
  marginTop: -2,
  marginBottom: 4,
};


const editBtnStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  padding: "7px 14px",
  borderRadius: 8,
  border: `1px solid ${BORDER}`,
  background: CARD,
  color: TEXT_PRIMARY,
  cursor: "pointer",
  fontSize: 13,
  fontWeight: 500,
  whiteSpace: "nowrap",
};

const deleteBtnStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  padding: "7px 14px",
  borderRadius: 8,
  border: `1px solid ${tokens.redBorder}`,
  background: tokens.redBg,
  color: tokens.red,
  cursor: "pointer",
  fontSize: 13,
  fontWeight: 500,
  whiteSpace: "nowrap",
};

const detailDividerStyle: React.CSSProperties = {
  height: 1,
  background: DIVIDER,
  margin: "0 0 20px",
};

const detailSectionStyle: React.CSSProperties = {
  marginBottom: 24,
};

const sectionHeadingStyle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 700,
  color: TEXT_PRIMARY,
  margin: "0 0 12px",
  letterSpacing: "0.02em",
};

const notesTextStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 15,
  color: TEXT_SECONDARY,
  lineHeight: 1.6,
};

const muscleLabelStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: "0.04em",
  textTransform: "uppercase",
  color: TEXT_SECONDARY,
};

const muscleChipBase: React.CSSProperties = {
  display: "inline-block",
  fontSize: 12,
  fontWeight: 500,
  borderRadius: 5,
  padding: "2px 8px",
};

const muscleChipPrimaryStyle: React.CSSProperties = {
  ...muscleChipBase,
  color: tokens.greenBadgeText,
  background: tokens.greenBadgeBg,
  border: `1px solid ${tokens.greenBadgeBorder}`,
};

const muscleChipSecondaryStyle: React.CSSProperties = {
  ...muscleChipBase,
  color: tokens.blue,
  background: tokens.blueBadgeBg,
  border: `1px solid ${tokens.blueBadgeBorder}`,
};

const instructionsListStyle: React.CSSProperties = {
  margin: 0,
  paddingLeft: 20,
  display: "flex",
  flexDirection: "column",
  gap: 6,
};

const instructionItemStyle: React.CSSProperties = {
  fontSize: 14,
  color: TEXT_SECONDARY,
  lineHeight: 1.5,
};

const detailRowsStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 0,
  background: CARD,
  borderRadius: 12,
  border: `1px solid ${BORDER}`,
  overflow: "hidden",
};

const detailRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  padding: "12px 16px",
  borderBottom: `1px solid ${DIVIDER}`,
};

const detailRowIconStyle: React.CSSProperties = {
  fontSize: 16,
  width: 20,
  textAlign: "center",
  flexShrink: 0,
  color: TEXT_SECONDARY,
};

const detailRowLabelStyle: React.CSSProperties = {
  flex: 1,
  fontSize: 14,
  fontWeight: 600,
  color: TEXT_PRIMARY,
};

const detailRowValueStyle: React.CSSProperties = {
  fontSize: 14,
  color: TEXT_SECONDARY,
};

const emptyDetailStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  height: "100%",
  padding: 40,
  textAlign: "center",
};

const overlayStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: tokens.overlay,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 100,
};

const modalStyle: React.CSSProperties = {
  background: CARD,
  borderRadius: 16,
  padding: "24px 24px 20px",
  width: 460,
  maxHeight: "88vh",
  overflowY: "auto",
  boxShadow: "0 8px 40px rgba(0,0,0,0.5)",
  border: `1px solid ${BORDER}`,
};

const modalTitleStyle: React.CSSProperties = {
  margin: "0 0 18px",
  fontSize: 18,
  fontWeight: 700,
  color: TEXT_PRIMARY,
};

const filterToggleRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  marginTop: 8,
};

const filterToggleBtnStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  borderRadius: 6,
  cursor: "pointer",
  padding: "4px 10px",
  letterSpacing: "0.01em",
};

const clearFiltersBtnStyle: React.CSSProperties = {
  fontSize: 11,
  padding: "3px 10px",
  borderRadius: 6,
  border: `1px solid ${BORDER}`,
  background: "transparent",
  color: TEXT_SECONDARY,
  cursor: "pointer",
};

const filtersGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 5,
  marginTop: 7,
};

const filterSelectStyle: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  padding: "5px 22px 5px 8px",
  borderRadius: 6,
  fontSize: 12,
  background: BG,
  outline: "none",
  cursor: "pointer",
  appearance: "none",
  WebkitAppearance: "none",
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath fill='%238e8e93' d='M5 6L0 0h10z'/%3E%3C/svg%3E")`,
  backgroundRepeat: "no-repeat",
  backgroundPosition: "right 7px center",
};

const catalogBadgeStyle: React.CSSProperties = {
  display: "inline-block",
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: "0.04em",
  textTransform: "uppercase",
  color: tokens.purple,
  background: tokens.purpleBg,
  border: `1px solid ${tokens.purpleBorder}`,
  borderRadius: 4,
  padding: "1px 6px",
};

const catalogBadgeDetailStyle: React.CSSProperties = {
  display: "inline-block",
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: "0.04em",
  textTransform: "uppercase",
  color: tokens.purple,
  background: tokens.purpleBg,
  border: `1px solid ${tokens.purpleBorder}`,
  borderRadius: 5,
  padding: "2px 8px",
  marginTop: 6,
};

const catalogDetailNoteStyle: React.CSSProperties = {
  margin: "10px 0 0",
  fontSize: 12,
  color: TEXT_SECONDARY,
  lineHeight: 1.5,
  padding: "7px 10px",
  borderRadius: 7,
  border: `1px solid ${tokens.purpleBorder}`,
  background: tokens.purpleBg,
};

const addToSetBtnStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  padding: "7px 14px",
  borderRadius: 8,
  border: "none",
  background: tokens.green,
  color: "#fff",
  cursor: "pointer",
  fontSize: 13,
  fontWeight: 600,
  whiteSpace: "nowrap",
};

const addToSetSubtitleStyle: React.CSSProperties = {
  margin: "-4px 0 14px",
  fontSize: 13,
  color: TEXT_PRIMARY,
};

const addToSetLabelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 12,
  fontWeight: 600,
  marginBottom: 5,
  color: TEXT_SECONDARY,
  letterSpacing: "0.02em",
};

const addToSetInputStyle: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  padding: "8px 10px",
  border: `1px solid ${tokens.borderMedium}`,
  borderRadius: 8,
  fontSize: 14,
  background: BG,
  color: TEXT_PRIMARY,
  outline: "none",
  fontFamily: "inherit",
};

const addToSetSelectStyle: React.CSSProperties = {
  ...addToSetInputStyle,
  paddingRight: 30,
  cursor: "pointer",
  appearance: "none",
  WebkitAppearance: "none",
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath fill='%238e8e93' d='M6 8L0 0h12z'/%3E%3C/svg%3E")`,
  backgroundRepeat: "no-repeat",
  backgroundPosition: "right 10px center",
};

const addToSetEmptyStyle: React.CSSProperties = {
  margin: "8px 0 12px",
  padding: "12px 14px",
  borderRadius: 8,
  border: `1px solid ${BORDER}`,
  background: tokens.cardSubtle,
  color: TEXT_SECONDARY,
  fontSize: 13,
  lineHeight: 1.5,
};

const addToSetErrorStyle: React.CSSProperties = {
  margin: "0 0 6px",
  fontSize: 12,
  color: tokens.red,
};

const modalCancelBtnStyle: React.CSSProperties = {
  padding: "8px 16px",
  borderRadius: 8,
  border: `1px solid ${tokens.borderMedium}`,
  background: "transparent",
  color: TEXT_SECONDARY,
  cursor: "pointer",
  fontSize: 14,
};

const modalConfirmBtnStyle: React.CSSProperties = {
  padding: "8px 16px",
  borderRadius: 8,
  border: "none",
  background: tokens.green,
  color: "#fff",
  fontSize: 14,
  fontWeight: 600,
};

const toastStyle: React.CSSProperties = {
  position: "fixed",
  bottom: 24,
  left: "50%",
  transform: "translateX(-50%)",
  background: tokens.bgElevated,
  color: TEXT_PRIMARY,
  border: `1px solid ${tokens.greenBadgeBorder}`,
  borderRadius: 8,
  padding: "8px 16px",
  fontSize: 13,
  fontWeight: 600,
  boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
  zIndex: 200,
};
