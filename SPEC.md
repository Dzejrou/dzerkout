# dzerkout — Product Specification

**Version**: 1.0  
**Date**: 2026-04-22  
**Platform**: macOS desktop + Android (Tauri v2 / React / TypeScript / Vite / Rust / SQLite)

---

## 1. Purpose and Scope

dzerkout is a single-user, local-first workout planning and tracking application. It allows the user to define exercises, compose reusable set templates, assemble workout templates from those sets, execute timed workout sessions, and build a detailed historical record for future analysis.

There are no cloud accounts, no image upload workflows, and no analytics UI in v1. All data lives in a local SQLite database. The data model is designed to support future sync without a schema redesign.

---

## 2. Core Entities

### 2.1 Exercise

| Field | Type | Notes |
|---|---|---|
| id | UUID | PK |
| name | TEXT NOT NULL | Unique display name |
| notes | TEXT | Optional freeform notes |
| image_url | TEXT NULLABLE | Reserved; not surfaced in v1 UI |
| created_at | TIMESTAMP | |
| updated_at | TIMESTAMP | |

**Rules**
- Name must be non-empty and unique.
- Deleting an exercise that is referenced by any `SetTemplateCard`, `WorkoutTemplateCardAssignment`, or `WorkoutSessionExercise` is blocked; the user must remove or replace those references first, or the system presents a confirmation that unlinks them. On confirmation:
  - Each referencing `SetTemplateCard` is converted: `card_type = placeholder`, `exercise_id = null`, `placeholder_tag = unspecified`, `placeholder_label` = the exercise's prior name (preserved as a reminder of what was there).
  - Each referencing `WorkoutTemplateCardAssignment` has `exercise_id` set to null. `display_label` is left unchanged if already set; if `display_label` is null, it is set to the exercise's prior name so the workout-specific assignment still carries a meaningful reminder. The assignment row is not deleted, as it may retain useful `duration_hint_sec` or `notes` overrides.
  - `WorkoutSessionExercise` rows are not modified; they retain their denormalized `display_name` and have `exercise_id` set to null.

---

### 2.2 SetTemplate

| Field | Type | Notes |
|---|---|---|
| id | UUID | PK |
| name | TEXT NOT NULL | |
| notes | TEXT NULLABLE | |
| created_at | TIMESTAMP | |
| updated_at | TIMESTAMP | |

Contains an ordered list of **SetTemplateCards**.

---

### 2.3 SetTemplateCard

Every card belongs to exactly one `SetTemplate` and has an `order_index` (0-based integer, unique within the set, gaps allowed, re-indexed on save).

| Field | Type | Notes |
|---|---|---|
| id | UUID | PK |
| set_template_id | UUID FK | |
| card_type | ENUM | `concrete` \| `placeholder` |
| order_index | INTEGER | |
| duration_hint_sec | INTEGER NULLABLE | Seconds; inherits from workout default at session start |
| notes | TEXT NULLABLE | |
| exercise_id | UUID NULLABLE FK | Only for `concrete` cards |
| placeholder_tag | TEXT NULLABLE | Only for `placeholder` cards |
| placeholder_label | TEXT NULLABLE | Only for `placeholder` cards |

**Card type invariants**
- A `concrete` card must have `exercise_id` set and `placeholder_tag` / `placeholder_label` null.
- A `placeholder` card must have `placeholder_tag` set to a known tag value, `exercise_id` null.
- `placeholder_label` is a human-readable string that supplements the tag (e.g., "Left arm pull").

**Placeholder tag vocabulary (v1)**

| Tag | Meaning |
|---|---|
| `unspecified` | Generic placeholder, no muscle direction |
| `push` | Push movement pattern |
| `pull` | Pull movement pattern |
| `legs` | Lower body |
| `core` | Core / stability |
| `mobility` | Stretching / mobility work |

The tag list is stored as a validated enum at the application layer; new tags can be added without a migration by relaxing validation in a future version. All existing tags must round-trip through save/load unchanged.

---

### 2.4 WorkoutTemplate

| Field | Type | Notes |
|---|---|---|
| id | UUID | PK |
| name | TEXT NOT NULL | |
| notes | TEXT NULLABLE | |
| default_exercise_duration_sec | INTEGER | Default: 120 |
| rest_between_sets_sec | INTEGER NULLABLE | Stored; not surfaced as a timer in v1 |
| created_at | TIMESTAMP | |
| updated_at | TIMESTAMP | |

Contains an ordered list of **WorkoutTemplateSetRefs** — ordered references to `SetTemplate` rows.

| Field | Type | Notes |
|---|---|---|
| id | UUID | PK |
| workout_template_id | UUID FK | |
| set_template_id | UUID FK | |
| order_index | INTEGER | |

A workout template references set templates by ID; changes to a set template are reflected in the workout template unless the set was cloned first.

A workout template may also contain **WorkoutTemplateCardAssignments** — workout-specific overrides or resolutions for individual cards within a set reference.

| Field | Type | Notes |
|---|---|---|
| id | UUID | PK |
| workout_template_set_ref_id | UUID FK | The set reference this assignment belongs to |
| set_template_card_id | UUID FK | The source card being overridden or resolved |
| exercise_id | UUID NULLABLE FK | Resolved exercise; used to assign a placeholder to a concrete exercise for this workout |
| display_label | TEXT NULLABLE | Override display name; falls back to exercise name or card's `placeholder_label` |
| duration_hint_sec | INTEGER NULLABLE | Override duration hint; falls back to the card's own value |
| notes | TEXT NULLABLE | Override notes for this card in this workout |
| created_at | TIMESTAMP | |
| updated_at | TIMESTAMP | |

**Assignment rules**
- At most one assignment per `(workout_template_set_ref_id, set_template_card_id)` pair.
- Placeholder cards may have an assignment that sets `exercise_id`, resolving the slot for this specific workout without modifying the reusable set template.
- Concrete cards may also have an assignment for workout-specific overrides; if none exists, the card's original values are used unchanged.
- A placeholder card with no assignment, or an assignment with `exercise_id = null`, remains unresolved; the session logs it with `display_name` derived from `placeholder_label ?? placeholder_tag`.

---

### 2.5 WorkoutSession

| Field | Type | Notes |
|---|---|---|
| id | UUID | PK |
| workout_template_id | UUID NULLABLE FK | Null for ad-hoc sessions (future) |
| source_workout_template_name | TEXT NULLABLE | Denormalized name of the template at snapshot time |
| status | ENUM | `draft` \| `in_progress` \| `completed` \| `abandoned` |
| session_date | DATE NULLABLE | Calendar date of the workout; null while draft, set when the user presses Start |
| started_at | TIMESTAMP NULLABLE | Null until the user presses Start |
| ended_at | TIMESTAMP NULLABLE | Null until session is completed or abandoned |
| notes | TEXT NULLABLE | |

---

### 2.6 WorkoutSessionSet

A snapshot of one set as it was performed. Created from a `SetTemplate` at snapshot time (Phase 1, before Start is pressed); modifications during the session do not affect the source template.

| Field | Type | Notes |
|---|---|---|
| id | UUID | PK |
| workout_session_id | UUID FK | |
| source_set_template_id | UUID NULLABLE | FK preserved for provenance; nullable in case template is later deleted |
| order_index | INTEGER | |
| started_at | TIMESTAMP NULLABLE | Set when this set becomes active; reset to `now()` on corrective Prev |
| ended_at | TIMESTAMP NULLABLE | |
| paused_total_sec | INTEGER NOT NULL DEFAULT 0 | Accumulated seconds the set timer was paused; reset to 0 on corrective Prev |
| paused_at | TIMESTAMP NULLABLE | Non-null while this set's timer is currently paused; null otherwise |

---

### 2.7 WorkoutSessionExercise

One card as it was performed (or skipped) within a session set.

| Field | Type | Notes |
|---|---|---|
| id | UUID | PK |
| workout_session_set_id | UUID FK | |
| order_index | INTEGER | |
| exercise_id | UUID NULLABLE FK | Null if placeholder was never resolved |
| placeholder_tag | TEXT NULLABLE | Preserved from template card |
| display_name | TEXT NOT NULL | Denormalized name at time of session |
| duration_hint_sec | INTEGER NULLABLE | Value actually used during this exercise |
| status | ENUM | `pending` \| `active` \| `completed` \| `skipped` |
| skipped | BOOLEAN NOT NULL DEFAULT false | |
| started_at | TIMESTAMP NULLABLE | |
| ended_at | TIMESTAMP NULLABLE | |
| notes | TEXT NULLABLE | |

**Status rules**
- All exercises are created with `status = pending` during the Phase 1 snapshot; they remain `pending` until the user presses Start.
- Once a session is `in_progress`, the currently active exercise is `active`; prior exercises are `completed` or `skipped`.
- Skipping sets `skipped = true` and `status = skipped` simultaneously; the record is never deleted.
- Only one exercise may be `active` at any time within a session.

---

## 3. Screens

### 3.1 Exercise Library

**Purpose**: Browse, create, edit, and delete exercises.

**States**
- **Empty**: "No exercises yet. Add your first exercise." + Add button.
- **List**: Scrollable list of exercise cards showing name and truncated notes.
- **Search**: Filter by name substring (client-side).
- **Detail / Edit form**: Name (required), notes (optional textarea), image_url placeholder field (disabled, shown as "Image — coming soon").

**User stories**
- As a user I can create an exercise with a name and optional notes.
- As a user I can edit an exercise's name or notes at any time.
- As a user I can delete an exercise; if it is in use, I am shown which set templates reference it and I must confirm before proceeding.
- As a user I can search exercises by name substring to find what I need quickly.

**Edge cases**
- Saving an exercise with a duplicate name shows an inline error.
- Editing the name of an exercise that is already referenced in a set template updates the `display_name` in future sessions but does not retroactively change existing session records (which store a denormalized name).

---

### 3.2 Set Template Builder

**Purpose**: Create and edit reusable set templates composed of ordered cards.

**States**
- **List view**: All saved set templates with name and card count.
- **Builder view**: Ordered list of cards with a toolbar to add concrete or placeholder cards.
- **Card editor popover/sheet**: Edit duration hint, notes, exercise (for concrete), tag + label (for placeholder).

**User stories**
- As a user I can create a set template with a name and optional notes.
- As a user I can add a concrete exercise card by selecting from the exercise library.
- As a user I can add a placeholder card by choosing a tag and optional label.
- As a user I can reorder cards.
  - **Desktop**: drag and drop.
  - **Android**: up/down arrow buttons or long-press drag (implementation-dependent).
- As a user I can set a per-card duration hint (in seconds).
- As a user I can duplicate a set template, producing an independent copy I can edit without affecting the original.
- As a user I can delete a set template; if it is referenced by a workout template, I am warned.

**Edge cases**
- A set template may have zero cards (empty set); this is valid to save and usable within a workout template, but empty sets are silently skipped during session snapshot — no `WorkoutSessionSet` is created for them.
- Reordering cards always produces a contiguous 0-based `order_index` on save.
- A cloned set template has no link back to the source; changes are fully independent.

---

### 3.3 Workout Template Builder

**Purpose**: Assemble an ordered list of set templates into a named workout template.

**States**
- **List view**: All saved workout templates with name, set count, and estimated total duration.
- **Builder view**: Ordered list of set references; each row shows set name and card summary.
- **Set picker sheet**: Browse and select from existing set templates to add a reference.
- **Settings panel**: `default_exercise_duration_sec`, `rest_between_sets_sec`, notes.

**Estimated duration calculation**  
Sum of: for each set reference → sum of per-card effective `duration_hint_sec` (assignment override ?? card's `duration_hint_sec` ?? `default_exercise_duration_sec`) + `rest_between_sets_sec` between sets. Displayed as "~X min".

**User stories**
- As a user I can create a workout template with a name, optional notes, a default exercise duration, and optional rest time.
- As a user I can add set references in order by picking from existing set templates.
- As a user I can reorder set references (desktop: drag and drop; Android: buttons/long-press).
- As a user I can remove a set reference from the workout without affecting the set template itself.
- As a user I can clone a set directly from within the workout builder to create an independent modified version (e.g., a second round that differs from the first).
- As a user I can assign a specific exercise to any placeholder card within a set reference, resolving it for this workout without modifying the reusable set template.
- As a user I can override the duration hint or notes for any card within a set reference for this workout specifically.
- As a user I can start a session from a workout template.

**Edge cases**
- The same set template may appear multiple times in one workout (allowed; they are independent references).
- A workout template with zero set references, or whose referenced sets collectively contain zero cards (concrete or placeholder), can be saved but not started (Start button disabled with tooltip: "Add at least one exercise to start"). Unresolved placeholder cards count as valid cards for startability.

---

### 3.4 Saved Workouts (Workout Template List)

**Purpose**: Entrypoint to all saved workout templates; start a session.

This screen is a focused view of the workout template list with a prominent "Start" action per row. It is a variant of the Workout Template Builder list view, not a separate data screen.

---

### 3.5 Active Workout Runner

**Purpose**: Guide the user through an in-progress workout session.

**Layout**

```
┌─────────────────────────────────────────────────┐
│  Workout Name          [Finish]  [Abandon]       │
│                                                  │
│           ╔══════════════════╗                   │
│           ║    00:01:47      ║  ← main timer     │
│           ╚══════════════════╝                   │
│                                                  │
│  Current: Bench Press  (Set 2 of 4)              │
│                                                  │
│  ← Prev   [  PAUSE  ]   Next →                   │
│                                                  │
│  ──────── Exercise Queue ────────────────────── │
│  [✓ Squat] [► Bench Press] [Deadlift] [Pullup]  │
│                             ↑ auto-scrolled      │
└─────────────────────────────────────────────────┘
```

**Timer behavior**
- The main timer is a count-up stopwatch measuring elapsed time for the current **set**.
- The timer resets only when the user enters a new set (moving to the first exercise of the next set via Next, or returning to the previous set via Prev).
- Navigating Next/Prev between exercises within the same set does not reset the main timer. Displayed elapsed set time excludes paused intervals:
  - While active: `now() - WorkoutSessionSet.started_at - paused_total_sec`
  - While paused: `WorkoutSessionSet.paused_at - started_at - paused_total_sec`
- Per-exercise `duration_hint_sec` is displayed as a per-card progress indicator alongside the queue; it is a hint, not an enforcer, and does not affect the main set timer.

**Exercise queue**
- Horizontal scrollable row of cards.
- Completed cards are marked with a checkmark and grayed out.
- Active card is highlighted and centered/visible.
- Skipped cards are marked with a strikethrough or skip icon.
- Cards are drawn from all sets in order; set boundaries are shown as dividers in the queue (meaningful because the main timer resets at each set boundary).
- Tapping a future card does not jump to it (only Next/Prev navigation is allowed in v1).

**Controls**
- **Start**: transitions session from `draft` to `in_progress` (`WorkoutSession.started_at = now()`, `status = in_progress`); activates the first exercise (`status = active`); starts the main set timer (`WorkoutSessionSet.started_at = now()` for the first set).
- **Pause**: sets `WorkoutSessionSet.paused_at = now()`; timer display freezes at `paused_at - started_at - paused_total_sec`. Does not change exercise status.
- **Resume**: adds `(now() - paused_at)` to `WorkoutSessionSet.paused_total_sec`, clears `paused_at = null`; timer resumes counting. Does not change exercise status.
- **Next**: completes current exercise (`status = completed`, `ended_at = now`), advances to next. If the next exercise is in a different set, records `ended_at` on the current `WorkoutSessionSet`, sets `started_at` on the next set, and resets the main timer. Otherwise the main timer continues uninterrupted.
- **Prev**: corrective navigation — treats the most recent forward move as if it did not happen. Time previously recorded on the affected rows is discarded; all affected timestamps are nulled and restarted from `now()`.
  - Current exercise: `started_at` and `ended_at` cleared to null, `status = pending`.
  - Previous exercise: `ended_at` cleared to null, `started_at = now()`, `status = active`.
  - Within the same set: the main set timer continues uninterrupted (the set's `started_at` is unchanged).
  - Crossing a set boundary: current `WorkoutSessionSet.started_at`, `ended_at`, and `paused_at` cleared to null and `paused_total_sec` reset to 0; previous `WorkoutSessionSet.ended_at` cleared to null, `started_at` reset to `now()`, `paused_at` cleared to null, `paused_total_sec` reset to 0; main timer restarts from zero for that set.
- **Skip**: marks current exercise `skipped = true`, `status = skipped`, advances to next.
- **Finish**: sets `WorkoutSession.status = completed`, `ended_at = now()`; sets `ended_at = now()` on the current exercise and the current set; navigates to history.
- **Abandon**: prompts confirmation; sets `WorkoutSession.status = abandoned` and `ended_at = now()`. Abandoned sessions do not appear in normal history (see §3.6).

**User stories**
- As a user I see a large timer so I can monitor elapsed time without squinting.
- As a user I can pause the timer when I need to rest or get interrupted.
- As a user I can advance to the next exercise when I finish early or am ready.
- As a user I can go back to the previous exercise if I navigated forward by mistake.
- As a user I can skip an exercise; it stays visible in the queue with a visual indicator.
- As a user I can edit the duration hint for any card mid-session without affecting the template.
- As a user I see the full exercise queue so I know what is coming up.

**Edge cases**
- If the session is paused when Next, Skip, or Finish is pressed, the pause is automatically ended first (equivalent to pressing Resume, then the action), so that `ended_at` timestamps are recorded in active time.
- If the user presses Next on the last exercise, the session is auto-finished after a confirmation prompt ("That was the last exercise. Finish workout?").
- Pressing Prev on the first exercise does nothing (button disabled).
- If the app is backgrounded/closed mid-session, the session remains in `in_progress` status. On re-open the user is offered to resume or discard it (see §4.3).
- A session with all exercises skipped is still a valid completed session.
- Timer continues running if the user switches to another screen (background timer) with an OS notification badge or persistent status if platform supports it.

---

### 3.6 Workout History

**Purpose**: Browse past sessions with full detail.

**States**
- **List view**: Reverse-chronological list of completed sessions. Each row shows date, workout template name (or "Ad hoc"), duration, and set/exercise count.
- **Detail view**: Expands to show each set and each exercise with actual timing, status (completed / skipped), and notes.

**User stories**
- As a user I can see all past workout sessions ordered by date.
- As a user I can open a session to see the exact exercise order, durations, and which items were skipped.
- As a user I can see the source template name for a session even if I later rename the template (stored in `WorkoutSession.source_workout_template_name` at snapshot time).

**Edge cases**
- `draft` sessions are not shown in the history list at all.
- `in_progress` sessions appear in the list with a "Resume" badge and are excluded from summary statistics.
- `abandoned` sessions are not shown in normal history.
- Deleted exercises still appear in history via the denormalized `display_name` field; the `exercise_id` FK may be null if the exercise was deleted.

---

## 4. Workflow Definitions

### 4.1 Starting a Session

Session creation is split into two phases.

**Phase 1 — Snapshot (on entering the runner)**

1. User taps **Start** on a workout template from Saved Workouts or Workout Template Builder.
2. System validates that the workout template has at least one card (concrete or placeholder) across all referenced sets; if not, Start is disabled (see §3.3).
3. System creates the session snapshot atomically:
   - Creates a `WorkoutSession` row with `status = draft`, `started_at = null`, `session_date = null`, `source_workout_template_name` = the template's current name.
   - For each `WorkoutTemplateSetRef` in order, **skipping set references whose `SetTemplate` has zero cards**:
     - Creates a `WorkoutSessionSet`.
     - For each `SetTemplateCard` in the set in order, creates a `WorkoutSessionExercise` with:
       - `exercise_id` = assignment's `exercise_id` ?? card's `exercise_id` (null if placeholder with no assignment).
       - `display_name` = assignment's `display_label` ?? exercise name ?? card's `placeholder_label` ?? card's `placeholder_tag`.
       - `duration_hint_sec` = assignment's `duration_hint_sec` ?? card's `duration_hint_sec` ?? `workout_template.default_exercise_duration_sec`.
       - `notes` = assignment's `notes` ?? card's `notes` ?? null.
       - `placeholder_tag` preserved from the source card (null for concrete cards).
       - `status = pending`, `skipped = false`.
4. Active Workout Runner is opened in pre-start (draft) state; the main timer shows `00:00:00` and is not running; the Start button is prominent.

**Phase 2 — Starting (on pressing Start in the runner)**

1. `WorkoutSession.started_at = now()`, `session_date = date(now())`, `status = in_progress`.
2. `WorkoutSessionSet.started_at = now()` for the first non-empty set.
3. First exercise transitions to `status = active`, `started_at = now()`.
4. Main set timer begins counting up.

**Important**: The snapshot is taken at Phase 1 entry. If the user edits the template or its sets while the runner is open (draft or in-progress), the active session is unaffected.

---

### 4.2 Cloning a Set

1. User is in Workout Template Builder and taps **Clone** next to a set reference.
2. System creates a new `SetTemplate` with a name like "<original name> (copy)" and duplicates all its `SetTemplateCard` rows with new IDs.
3. The workout template's reference is updated to point to the new cloned set (or a new reference is inserted after the source — UX decision).
4. The original set template is unchanged.

---

### 4.3 Session Resume and Recovery

On app launch, the system checks for any session with `status = draft` or `status = in_progress`.

**Draft session** (snapshot taken, Start not yet pressed):
- A modal prompts: **Continue** / **Discard**.
- **Continue**: navigates to Active Workout Runner in the pre-start state.
- **Discard**: deletes the session and all its child rows.

**In-progress session** (Start pressed, session not ended):
- A modal prompts: **Resume** / **Discard**.
- **Resume**: navigates to Active Workout Runner, restoring the last `active` exercise. If `WorkoutSessionSet.paused_at` is non-null (app closed while paused), the timer displays the frozen value `paused_at - started_at - paused_total_sec` and waits for Resume. If `paused_at` is null, the timer immediately resumes from `now() - started_at - paused_total_sec`.
- **Discard**: deletes the session and all its child rows.

Only one non-completed session is possible at a time. Starting a new session is blocked if a draft or in-progress session already exists.

---

## 5. Data Persistence Rules

- All writes use SQLite transactions. A session snapshot (start) is atomic.
- Foreign key constraints are enforced (`PRAGMA foreign_keys = ON`).
- `updated_at` triggers update on every row mutation.
- UUID generation happens in the Rust layer to avoid platform inconsistencies.
- Schema migrations use sequential numbered migration files; no destructive migrations in v1.

---

## 6. Timing Model

| Concept | What it measures | Authoritative? |
|---|---|---|
| Main timer (count-up) | Elapsed time on the current **set** | Display only |
| `duration_hint_sec` | Expected duration of a single exercise slot | Hint / per-card progress indicator |
| `WorkoutSessionSet.started_at / ended_at / paused_total_sec` | Set timing; actual active duration = `ended_at - started_at - paused_total_sec` | Authoritative history |
| `WorkoutSessionExercise.started_at / ended_at` | Wall-clock timestamps of each exercise | Authoritative history |
| `WorkoutSession.started_at / ended_at` | Wall-clock timestamps of the whole session | Authoritative history |

The per-exercise hint does not stop the session or auto-advance. It exists to give the user a per-card target and to drive future analytics (planned vs. actual duration).

Prev is defined as a corrective rewrite: all timestamps on affected exercise and set rows are reset to null and restarted from `now()`, and `paused_total_sec` is reset to 0. There is no interval-log tracking; `started_at` always represents the most recent time that row became active, and `paused_total_sec` is its only companion accumulator.

---

## 7. Navigation Model

```
Tab / Sidebar navigation (persistent):
  ├── Exercises          → Exercise Library
  ├── Sets               → Set Template Builder
  ├── Workouts           → Workout Template Builder / Saved Workouts
  ├── Active Session     → Active Workout Runner (visible only when a draft or in-progress session exists)
  └── History            → Workout History
```

Navigating away from Active Workout Runner does not pause the session. The tab remains highlighted when a session is in progress.

---

## 8. Platform Considerations

### Desktop (macOS)
- Full drag-and-drop for card and set reordering in all builders.
- Keyboard shortcuts for Next (→), Prev (←), Pause/Resume (Space) in Active Workout Runner.
- Window can be resized; Active Workout Runner should remain usable at narrow widths.

### Android
- Builder reordering via long-press drag or explicit up/down buttons; drag-and-drop is a stretch goal.
- Active Workout Runner must be legible on small screens; the main timer is the largest element.
- Background timer uses an Android foreground service notification to prevent OS from killing the session.

---

## 9. Non-Goals (v1)

- Cloud sync or user accounts.
- Image upload or display for exercises.
- Audio cues or vibration on exercise completion.
- Muscle-group analytics or balance charts.
- Multiple concurrent users or devices.
- Rest timer UI (data model stores `rest_between_sets_sec`; no countdown is shown between sets in v1).

---

## 10. Future-Proofing Notes

These are not v1 deliverables but the schema must support them:

- **Sync**: All PKs are UUIDs; `created_at` / `updated_at` on every row. A `sync_id` column can be added without breaking existing queries.
- **Muscle analytics**: `placeholder_tag` on session exercises and `exercise_id` FK allow future muscle-group tagging of exercises and analysis of planned vs. performed patterns.
- **Image support**: `image_url` field is present on `Exercise`; the UI field is shown but disabled.
- **Ad-hoc sessions**: `workout_template_id` is nullable on `WorkoutSession`; a future "quick start" flow can create sessions without a template.
- **Rest timers**: `rest_between_sets_sec` is stored; a v2 UI can surface a between-set countdown without a schema change.

---

## 11. Open Questions (to resolve before implementation)

| # | Question | Impact |
|---|---|---|
| 1 | When cloning a set from the workout builder, does the new reference replace the original or insert after it? | UX + data |
| 2 | On Android, is long-press drag sufficient for reordering or do explicit arrow buttons need to ship in v1? | Android UX |
| 3 | What is the exact visual treatment for the per-card duration hint in the runner — countdown overlay, progress ring, or progress bar? | Runner UX |
