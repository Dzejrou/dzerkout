# dzerkout — Product Specification

**Version**: 1.1
**Date**: 2026-05-05
**Platform**: macOS desktop + Android (Tauri v2 / React / TypeScript / Vite / Rust / SQLite)

---

## 1. Purpose and Scope

dzerkout is a single-user, local-first workout planning and tracking application. It allows the user to define exercises, compose reusable set templates, assemble workout templates from those sets, execute timed workout sessions, and build a detailed historical record for future analysis.

There are no cloud accounts and no image upload workflows in v1. All data lives in a local SQLite database. The data model is designed to support future sync without a schema redesign.

---

## 2. Core Entities

### 2.1 Exercise

| Field | Type | Notes |
|---|---|---|
| id | UUID | PK |
| name | TEXT NOT NULL | Unique display name |
| sanskrit_name | TEXT NULLABLE | Sanskrit name for yoga poses (e.g., `Adho Mukha Svanasana`); null for non-yoga exercises |
| notes | TEXT | Optional freeform notes |
| image_url | TEXT NULLABLE | Reserved; not surfaced in UI |
| is_catalog | BOOLEAN | True for exercises imported from a catalog source |
| catalog_source | TEXT NULLABLE | Identifies the catalog (e.g., `"free-exercise-db"`, `"yoga-poses"`, `"default"`) |
| catalog_id | TEXT NULLABLE | Source-internal identifier; used for idempotent re-import |
| category | TEXT NULLABLE | Movement category (e.g., `strength`, `cardio`, `yoga`) |
| equipment | TEXT NULLABLE | Required equipment (e.g., `barbell`, `none`) |
| level | TEXT NULLABLE | Difficulty level: `beginner`, `intermediate`, `expert` |
| mechanic | TEXT NULLABLE | `compound` or `isolation` |
| force | TEXT NULLABLE | `push`, `pull`, or `static` |
| instructions_json | TEXT NULLABLE | JSON array of step strings; from catalog data only |
| created_at | TIMESTAMP | |
| updated_at | TIMESTAMP | |

**Tags**
Each exercise carries a set of tags stored in a separate `exercise_tags` table (one row per tag). Tags are descriptive labels such as `push`, `pull`, `legs`, `core`, `mobility`, `yoga`, `cardio`, `isotonic`, `isometric`, `concentric`, `eccentric`, and `unspecified`. An exercise may have zero or more tags; each tag value may appear at most once per exercise. Tags are validated at the application layer against the defined vocabulary; no tag is stored in the exercise row itself.

**Muscles**
Each exercise may have zero or more associated muscles stored in an `exercise_muscles` table (one row per muscle+role pair). Each muscle entry has a `role` of `primary` or `secondary`. Muscle names are validated against a fixed vocabulary (e.g., `quadriceps`, `hamstrings`, `chest`, `lats`, `shoulders`, etc.).

**Pose types**
Each exercise may have zero or more pose types stored in an `exercise_pose_types` table (one row per pose type). Pose types describe yoga-style positional categories and are validated against a fixed vocabulary: `standing`, `forward_bend`, `seated`, `arm_leg_support`, `back_bend`, `balancing`, `arm_balance`, `supine`, `prone`, `inversion`, `twist`, `lateral_bend`. Non-yoga exercises typically have no pose types. Pose types are exported and imported with the exercise and are searchable/filterable in the Exercise Library and the set-card exercise picker.

**Rules**
- Name must be non-empty and unique.
- Catalog exercises (`is_catalog = true`) can be edited; local edits are persisted but may be overwritten if the catalog is re-imported.
- Deleting an exercise that is referenced by any `SetTemplateCard` or `WorkoutTemplateCardAssignment` is blocked; the user must remove or replace those references first, or the system presents a confirmation that unlinks them. On confirmation:
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
| owning_workout_template_id | UUID NULLABLE FK | Null for global (library) sets; non-null for workout-local (forked) sets |
| created_at | TIMESTAMP | |
| updated_at | TIMESTAMP | |

Contains an ordered list of **SetTemplateCards**.

A set template is **global** when `owning_workout_template_id` is null — it appears in the set library and can be referenced by any workout template. A set template is **workout-local** (forked) when `owning_workout_template_id` is non-null — it is owned exclusively by that workout template and is deleted automatically if the workout template is deleted.

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
- **Card type is fixed at creation time and cannot be changed.**

**Placeholder tag vocabulary**

| Tag | Meaning |
|---|---|
| `unspecified` | Generic placeholder, no movement direction |
| `push` | Push movement pattern |
| `pull` | Pull movement pattern |
| `legs` | Lower body |
| `core` | Core / stability |
| `mobility` | Stretching / mobility work |

The placeholder tag list is stored as a validated enum at the application layer; new tags can be added without a migration by relaxing validation in a future version. All existing tags must round-trip through save/load unchanged.

---

### 2.4 WorkoutTemplate

| Field | Type | Notes |
|---|---|---|
| id | UUID | PK |
| name | TEXT NOT NULL | |
| notes | TEXT NULLABLE | |
| default_exercise_duration_sec | INTEGER | Default: 120 |
| rest_between_sets_sec | INTEGER NULLABLE | Between-set rest duration shown as a countdown in the runner |
| created_at | TIMESTAMP | |
| updated_at | TIMESTAMP | |

Contains an ordered list of **WorkoutTemplateSetRefs** — ordered references to `SetTemplate` rows.

| Field | Type | Notes |
|---|---|---|
| id | UUID | PK |
| workout_template_id | UUID FK | |
| set_template_id | UUID FK | |
| source_set_template_id | UUID NULLABLE | ID of the original set before forking; stored for display (shows a "Forked" badge); no FK constraint |
| order_index | INTEGER | |

A workout template references set templates by ID; changes to a global set template are reflected in the workout template unless the set was forked first.

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
| rest_duration_sec | INTEGER NULLABLE | Rest duration (seconds) for the preceding between-set rest phase |
| rest_started_at | TIMESTAMP NULLABLE | Non-null while the between-set rest phase before this set is active |

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
| paused_offset_sec | INTEGER NOT NULL DEFAULT 0 | Value of the set's `paused_total_sec` at the moment this exercise became active; used to compute per-exercise elapsed time |
| performed_duration_sec | INTEGER NULLABLE | Actual exercise duration in seconds, computed on completion; excludes pauses that occurred before this exercise started |

**Status rules**
- All exercises are created with `status = pending` during the Phase 1 snapshot; they remain `pending` until the user presses Start.
- Once a session is `in_progress`, the currently active exercise is `active`; prior exercises are `completed` or `skipped`.
- Skipping sets `skipped = true` and `status = skipped` simultaneously; the record is never deleted.
- Only one exercise may be `active` at any time within a session.

---

## 3. Screens

### 3.0 MainMenu / Navigation Hub

**Purpose**: Central navigation dashboard; the app's home screen (`/`).

**Layout**: Three zones — a left column of builder tools (Exercises, Sets, Workouts), a center logo, and a right column of performance tools (Runner, History, Stats). A settings gear button appears in the top-right corner.

**Behavior**
- Tapping any nav button navigates directly to that screen.
- The Runner button shows an **Active** badge when a draft or in-progress session exists.
- No persistent tab bar or sidebar; all navigation is hub-and-spoke through this screen.

---

### 3.1 Exercise Library

**Purpose**: Browse, create, edit, and delete exercises.

**States**
- **Empty**: "No exercises yet. Create one to get started." prompt.
- **List**: Paginated list of exercise cards (page size 50). Selecting an exercise shows its detail pane. The selected exercise remains stable across page changes.
- **Search / filter**: Backend-backed search and filter with server-side pagination; results update as the user types or changes filters. Any change to the search text or filters resets the view to the first page.
- **Detail pane**: Shows name, Sanskrit name as secondary text (when present), catalog badge (if applicable), tags, notes, muscles (primary and secondary), pose types (when present), instructions (step list, catalog exercises only), catalog metadata (category, equipment, level, mechanic, force, catalog source, catalog ID), and an **Add to set** action.
- **Edit form**: Name (required), notes, tags (multi-select from vocabulary), muscles (primary/secondary multi-select), and catalog metadata fields.

**Search**
The search field matches the typed query against both the exercise's English `name` and its `sanskrit_name`. Sanskrit name is structured metadata, not a filter — it is used for display and as a search-match target.

**Filters**
Exercises can be filtered by any combination of: **Library** (broad source: all / user / catalog), **Source** (specific catalog source value, e.g. `free-exercise-db`, `yoga-poses`, `default`), category, equipment, level, primary muscle, force, tag, and pose type. Combining `Library = user` with a specific `Source` is invalid (a user-created exercise cannot have a catalog source); the UI prevents this combination. The Source filter composes with all other filters and with paging. Filtering is performed server-side (Rust backend).

**Add to set**
The detail pane offers an **Add to set** action. The user selects a target set template from the global (library) sets — workout-local forked sets are not valid targets. The selected exercise is appended as a concrete card to that set using the backend's append semantics for `order_index`. Duplicates are allowed (the same exercise may already exist on the target set). The user may optionally provide a duration hint and notes for the new card.

**User stories**
- As a user I can create an exercise with a name, optional notes, and optional tags.
- As a user I can tag an exercise with movement-pattern labels (push, pull, legs, core, mobility, yoga, cardio, etc.) to group it with similar exercises.
- As a user I can record primary and secondary muscle groups for an exercise.
- As a user I can record a Sanskrit name for a yoga exercise and have it displayed alongside the English name.
- As a user I can edit an exercise's name, notes, tags, and muscles at any time.
- As a user I can search the exercise library by typing English or Sanskrit name fragments.
- As a user I can filter the library by Library (user/catalog), Source (specific catalog), category, equipment, level, primary muscle, force, tag, or pose type, and combine filters freely.
- As a user I can browse the library page by page (50 per page) without losing my selected exercise.
- As a user I can add a selected exercise directly to a global set template from the detail pane.
- As a user I can delete an exercise; if it is in use, I am shown which set templates reference it and I must confirm before proceeding.
- As a user I can view full details (category, equipment, instructions, muscles, pose types, Sanskrit name) for catalog exercises.

**Catalog exercises**
Exercises imported from an external catalog (`is_catalog = true`) display a **Catalog** badge. Their detail pane includes read-only metadata such as instructions, category, equipment, and level. They can be edited normally, but a note warns that local edits may be overwritten if the catalog is re-imported via Settings → Data → Import.

**Edge cases**
- Saving an exercise with a duplicate name shows an inline error.
- Editing the name of an exercise that is already referenced in a set template updates the `display_name` in future sessions but does not retroactively change existing session records (which store a denormalized name).

---

### 3.2 Set Template Builder

**Purpose**: Create and edit reusable set templates composed of ordered cards.

**States**
- **List view**: All global (library) set templates with name and card count.
- **Builder view**: Ordered list of cards with a toolbar to add concrete or placeholder cards.
- **Card editor popover/sheet**: Edit duration hint, notes, exercise (for concrete), tag + label (for placeholder).

**User stories**
- As a user I can create a set template with a name and optional notes.
- As a user I can add a concrete exercise card by selecting from the exercise library using a searchable, filterable picker.
- As a user I can add a placeholder card by choosing a tag and optional label.
- As a user I can reorder cards.
  - **Desktop**: drag and drop.
  - **Android**: up/down arrow buttons.
- As a user I can set a per-card duration hint (in seconds).
- As a user I can duplicate a set template, producing an independent copy I can edit without affecting the original.
- As a user I can delete a set template; if it is referenced by a workout template, I am warned.

**Exercise picker**
When adding or editing a concrete card, the exercise picker is a searchable, filterable, **paginated** sheet backed by the server (page size 40). The search query matches both English name and Sanskrit name. Filters include: Library (user/catalog), Source (specific catalog), category, equipment, level, primary muscle, force, tag, and pose type. Search and filter changes reset to the first page. The picker shows exercise name, Sanskrit name (when present), category, equipment, level, and primary muscles for each result.

**Edge cases**
- A set template may have zero cards (empty set); this is valid to save and usable within a workout template, but empty sets are silently skipped during session snapshot — no `WorkoutSessionSet` is created for them.
- Reordering cards always produces a contiguous 0-based `order_index` on save.
- A cloned set template has no link back to the source; changes are fully independent.
- **Card type is fixed at creation time** and cannot be changed via the editor.

---

### 3.3 Workout Template Builder

**Purpose**: Assemble an ordered list of set templates into a named workout template.

**States**
- **List view**: All saved workout templates with name, set count, and estimated total duration.
- **Builder view**: Ordered list of set references; each row shows set name, card summary, and a "Forked" badge for workout-local sets.
- **Set picker sheet**: Browse and select from existing global (library) set templates to add a reference.
- **Settings panel**: `default_exercise_duration_sec`, `rest_between_sets_sec`, notes.

**Estimated duration calculation**  
Sum of: for each set reference → sum of per-card effective `duration_hint_sec` (assignment override ?? card's `duration_hint_sec` ?? `default_exercise_duration_sec`) + `rest_between_sets_sec` between sets. Displayed as "~X min".

**User stories**
- As a user I can create a workout template with a name, optional notes, a default exercise duration, and optional rest time between sets.
- As a user I can add set references in order by picking from existing global set templates.
- As a user I can reorder set references (desktop: drag and drop; Android: up/down buttons).
- As a user I can remove a set reference from the workout without affecting the set template itself.
- As a user I can **fork** a set directly from within the workout builder to create a workout-local copy (e.g., a second round that differs from the first). The forked set is displayed with a "Forked" badge and is accessible only within this workout.
- As a user I can **export a forked set** to the global library under a new name, making it reusable across other workouts.
- As a user I can assign a specific exercise to any placeholder card within a set reference, resolving it for this workout without modifying the reusable set template.
- As a user I can override the duration hint or notes for any card within a set reference for this workout specifically.
- As a user I can start a session from a workout template.

**Edge cases**
- The same set template may appear multiple times in one workout (allowed; they are independent references).
- A workout template with zero set references, or whose referenced sets collectively contain zero cards (concrete or placeholder), can be saved but not started (Start button disabled with tooltip: "Add at least one exercise to start"). Unresolved placeholder cards count as valid cards for startability.
- Forked (workout-local) sets are deleted automatically when the owning workout template is deleted.

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
│  ← Back           [Finish]  [Abandon]            │
│                                                  │
│  ┌───────────────┐  │  ┌──────── Queue ────────┐ │
│  │  SET TIME     │  │  │  ∧                    │ │
│  │  00:01:47     │  │  │  [✓ Squat]            │ │
│  │               │  │  │  [► Bench Press]      │ │
│  │  EXERCISE     │  │  │  [Deadlift]           │ │
│  │  TIME         │  │  │  [REST]               │ │
│  │  00:00:32     │  │  │  [Pullup]             │ │
│  │  of 01:00     │  │  │  ∨                    │ │
│  │  Bench Press  │  │  └───────────────────────┘ │
│  └───────────────┘                               │
│                                                  │
│  ← Prev   [  PAUSE  ]   Next →                   │
│       [Finish]       [Abandon]                   │
└─────────────────────────────────────────────────┘
```

**Timer behavior**
- The **SET TIME** timer is a count-up stopwatch measuring elapsed active time for the current **set**.
- The timer resets only when the user enters a new set (moving to the first exercise of the next set via Next/Start Set, or returning to the previous set via Prev).
- Navigating Next/Prev between exercises within the same set does not reset the main timer. Displayed elapsed set time excludes paused intervals:
  - While active: `now() - WorkoutSessionSet.started_at - paused_total_sec`
  - While paused: `WorkoutSessionSet.paused_at - started_at - paused_total_sec`
- The **EXERCISE TIME** timer measures elapsed time for the current exercise only. It excludes pauses that occurred before this exercise started (tracked via `paused_offset_sec`). When the exercise has a `duration_hint_sec`, the display shows elapsed and target time (e.g., "00:00:32 of 01:00").

**Exercise queue**
- Vertical scrollable column of exercise cards. The current exercise is centered; adjacent exercises are visible above and below.
- Completed cards are marked with a checkmark. Active card is highlighted. Skipped cards are marked.
- Between each set pair (when `rest_between_sets_sec > 0`), a REST slot is shown in the queue at the appropriate position.
- Tapping a future card does not jump to it (only Next/Prev navigation is allowed in v1).
- The exercise card size is adjustable via a **Runner card size** setting.

**Between-set rest phase**
When `rest_between_sets_sec > 0` and the last exercise in a set is completed (via Next), the runner enters a rest phase before starting the next set:
- The SET TIME and EXERCISE TIME panels are replaced by a **REST** countdown timer (counting down from `rest_between_sets_sec`).
- An **UP NEXT** preview panel shows the exercises in the upcoming set.
- When the rest countdown reaches zero it turns amber and shows "OVERDUE"; the rest phase continues until the user acts.
- The **Start Set** button immediately ends rest and begins the next set.
- The **Prev** button cancels the rest phase and returns to the last exercise of the previous set.
- If **Auto-start next set** is enabled (see §3.8), the next set starts automatically when the countdown reaches zero.

**Controls**
- **Start**: transitions session from `draft` to `in_progress` (`WorkoutSession.started_at = now()`, `status = in_progress`); activates the first exercise (`status = active`); starts the main set timer (`WorkoutSessionSet.started_at = now()` for the first set).
- **Pause**: sets `WorkoutSessionSet.paused_at = now()`; both timers freeze. Does not change exercise status.
- **Resume**: adds `(now() - paused_at)` to `WorkoutSessionSet.paused_total_sec`, clears `paused_at = null`; both timers resume. Does not change exercise status.
- **Next**: completes current exercise (`status = completed`, `ended_at = now`), advances to next. If the next exercise is in a different set and `rest_between_sets_sec > 0`, enters the rest phase (see above). If the next exercise is in a different set and there is no rest, records `ended_at` on the current set, sets `started_at` on the next set, and resets the main timer. If exercises are in the same set, the main set timer continues uninterrupted.
- **Start Set**: available during the rest phase; ends rest, starts the next set, and activates its first exercise.
- **Prev**: corrective navigation — treats the most recent forward move as if it did not happen. Time previously recorded on the affected rows is discarded; all affected timestamps are nulled and restarted from `now()`.
  - Current exercise: `started_at` and `ended_at` cleared to null, `status = pending`.
  - Previous exercise: `ended_at` cleared to null, `started_at = now()`, `status = active`.
  - Within the same set: the main set timer continues uninterrupted (the set's `started_at` is unchanged).
  - Crossing a set boundary: current `WorkoutSessionSet.started_at`, `ended_at`, and `paused_at` cleared to null and `paused_total_sec` reset to 0; previous `WorkoutSessionSet.ended_at` cleared to null, `started_at` reset to `now()`, `paused_at` cleared to null, `paused_total_sec` reset to 0; main timer restarts from zero for that set.
  - During the rest phase: cancels rest and returns to the last exercise of the previous set (same set-boundary rewrite as above).
- **Skip**: marks current exercise `skipped = true`, `status = skipped`, advances to next. Skip always bypasses the between-set rest phase and starts the next set immediately.
- **Finish**: prompts confirmation; sets `WorkoutSession.status = completed`, `ended_at = now()`; sets `ended_at = now()` on the current exercise and the current set; navigates to History.
- **Abandon**: prompts confirmation; sets `WorkoutSession.status = abandoned` and `ended_at = now()`. Navigates to MainMenu. Abandoned sessions do not appear in the history list (see §3.6).

**Auto-advance exercises**
When the **Auto-advance** setting is enabled (see §3.8), the runner automatically calls Next when the exercise timer reaches `duration_hint_sec`. Auto-advance is suppressed while paused and during a rest phase.

**Sound cues**
When the **Sound cues** setting is enabled (see §3.8), Web Audio beeps play as the exercise or rest countdown approaches zero (at 2 s, 1 s, 0 s remaining, and a final tone at −1 s). Cues are suppressed while paused and for exercises with no `duration_hint_sec`.

**Keyboard shortcuts (desktop only)**
- `→` (ArrowRight): Next
- `←` (ArrowLeft): Prev
- `Space`: Pause / Resume

**User stories**
- As a user I see a large set timer and a per-exercise timer so I can monitor elapsed time without squinting.
- As a user I can pause the timers when I need to rest or get interrupted.
- As a user I can advance to the next exercise when I finish early or am ready.
- As a user I can go back to the previous exercise if I navigated forward by mistake.
- As a user I can skip an exercise; it stays visible in the queue with a visual indicator.
- As a user I see the full exercise queue so I know what is coming up.
- As a user I can rest between sets with a visible countdown and a preview of the next set.

**Edge cases**
- If the session is paused when Next, Skip, or Finish is pressed, the pause is automatically ended first (equivalent to pressing Resume, then the action), so that `ended_at` timestamps are recorded in active time.
- If the user presses Next on the last exercise of the last set, a confirmation prompt is shown: "That was the last exercise. Finish workout?"
- If all remaining exercises are skipped and there is no rest phase pending, a confirmation prompt is shown: "All remaining exercises skipped. Finish workout?"
- Pressing Prev on the first exercise of the first set does nothing (button disabled).
- If the app is backgrounded/closed mid-session, the session remains in `in_progress` status. On re-open the user is offered to resume or discard it (see §4.3).
- A session with all exercises skipped is still a valid completed session.
- Navigating away from the runner to another screen does not pause the session; the DB-sourced timer values are unchanged and the runner restores correctly on return.

---

### 3.6 Workout History

**Purpose**: Browse past and in-progress sessions with full detail.

**States**
- **List view**: Reverse-chronological list of non-draft sessions (`completed` and `in_progress`). Each row shows date, workout template name (or "Workout"), duration, set count, and a status badge (Completed / In Progress). A search field filters by workout template name.
- **Detail view**: Shows workout name, date, status, total duration, set count, exercise count; then a per-set breakdown with each exercise's display name, card type, performed duration (from `performed_duration_sec`), and completion status.

**User stories**
- As a user I can see past workout sessions ordered by date.
- As a user I can search sessions by workout name.
- As a user I can open a session to see the exact exercise order, per-exercise durations, and which items were skipped.
- As a user I can see the source template name for a session even if I later rename the template (stored in `WorkoutSession.source_workout_template_name` at snapshot time).

**Edge cases**
- `draft` sessions are not shown in the history list.
- `in_progress` sessions appear in the list with an **In Progress** badge and are excluded from summary statistics in Stats.
- `abandoned` sessions are not shown in the history list.
- Deleted exercises still appear in history via the denormalized `display_name` field; the `exercise_id` FK may be null if the exercise was deleted.

---

### 3.7 Stats

**Purpose**: Aggregate statistics across completed workout sessions.

**Range selector**: All time / 30 days / 7 days. Applies to all panels.

**Panels**

**Summary**: Totals for the selected range.
- Completed workouts
- Total workout duration
- Total exercise duration
- Total sets
- Total exercises
- Skipped exercises
- Last completed workout date

**By Tag**: For each exercise tag that appears in the range, shows total active exercise duration and exercise count. Tags are derived from the tags stored on each exercise at the time statistics are queried (not denormalized into session data).

**Top Exercises**: Per-exercise leaderboard showing display name, exercise count, total active duration, skip count, and last performed date.

---

### 3.8 Settings

**Purpose**: User preferences and data management.

**Categories**

**Appearance**
- **Theme**: Choose from `dark`, `graphite`, `forest`, `ember`, `slate`. Applied immediately; persisted across sessions.

**Runner**
- **Auto-advance exercises**: When enabled, the runner automatically moves to the next exercise when the exercise timer reaches `duration_hint_sec`. Default: off.
- **Auto-start next set**: When enabled, the next set starts automatically when the between-set rest countdown reaches zero. Default: off.
- **Runner card size**: Scale multiplier (0.5× – 2.0×) for exercise queue cards. Default: 1.0×.

**Sound**
- **Sound cues**: Enable Web Audio countdown beeps for timed exercise and rest phases. Default: off.
- **Preview**: Play the full cue sequence (2 s, 1 s, 0 s, −1 s tones) for preview.

**Data**
- **Export to clipboard**: Exports a full library JSON to the system clipboard.
- **Export to file**: Opens a save dialog and writes a full library JSON file.
- **Import from file**: Opens a file picker, reads a library JSON file, and upserts all entities. Reports counts of created and updated rows.
- **Reset local data**: Clears all data and re-seeds the default exercise library. Prompts confirmation.
- **Clear local data**: Deletes all exercises, templates, sessions, and history without re-seeding. Prompts confirmation.

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
4. Active Workout Runner is opened in pre-start (draft) state; the timers show `00:00` and are not running; the Start button is prominent. A Discard button is also available.

**Phase 2 — Starting (on pressing Start in the runner)**

1. `WorkoutSession.started_at = now()`, `session_date = date(now())`, `status = in_progress`.
2. `WorkoutSessionSet.started_at = now()` for the first non-empty set.
3. First exercise transitions to `status = active`, `started_at = now()`, `paused_offset_sec = 0`.
4. Both set and exercise timers begin counting up.

**Important**: The snapshot is taken at Phase 1 entry. If the user edits the template or its sets while the runner is open (draft or in-progress), the active session is unaffected.

---

### 4.2 Forking (Cloning) a Set

**Fork from the workout builder**
1. User is in Workout Template Builder and taps **Fork** next to a set reference.
2. System creates a new `SetTemplate` with the same name and all cards duplicated, with `owning_workout_template_id` set to the current workout template's ID (making it workout-local).
3. The set reference's `source_set_template_id` is set to the original set's ID (for the "Forked" badge).
4. The reference now points to the new workout-local set. The original global set template is unchanged.
5. The new set appears immediately after the original in the set reference list.

**Export a forked set**
1. User taps **Export** on a forked (workout-local) set reference.
2. User provides a new name.
3. System promotes the set to the global library: `owning_workout_template_id` is cleared to null under the new name, making it available to all workouts.

**Clone from the set library**
Cloning a set from the Set Template Builder list creates a fully independent global set with a name like "<original name> (copy)". The clone has no link to the source; both are global.

---

### 4.3 Session Resume and Recovery

On app launch, the system checks for any session with `status = draft` or `status = in_progress`.

**Draft session** (snapshot taken, Start not yet pressed):
- The session store is hydrated silently.
- MainMenu shows the Runner **Active** badge.
- The user can open Runner to continue in the pre-start state or discard the draft from the runner.

**In-progress session** (Start pressed, session not ended):
- The session store is hydrated silently.
- MainMenu shows the Runner **Active** badge.
- The user can open Runner manually. If `WorkoutSessionSet.paused_at` is non-null (app closed while paused), the timers display their frozen values and wait for Resume. If `paused_at` is null, the timers immediately resume from the correct DB-sourced values.

Only one non-completed session is possible at a time. Starting a new session is blocked if a draft or in-progress session already exists.

---

## 5. Data Persistence Rules

- All writes use SQLite transactions. A session snapshot (start) is atomic.
- Foreign key constraints are enforced (`PRAGMA foreign_keys = ON`) on every database connection.
- `updated_at` triggers update on every row mutation.
- UUID generation happens in the Rust layer to avoid platform inconsistencies.
- Schema migrations use sequential numbered migration files; no destructive migrations in v1. See `PERSISTENCE.md` for the full migration history.

**Library export / import / reset / clear**

The app provides a full library export/import system accessible from Settings → Data. The export format (`dzerkout.library` JSON, version 1) includes all exercises (with tags and muscles), set templates, workout templates, and session history.

- **Export**: produces a complete snapshot. Available via clipboard or file.
- **Import**: upserts all entities from a JSON file in a single transaction. Idempotent — re-importing the same file updates existing rows rather than creating duplicates.
- **Reset**: clears all data and re-seeds the default exercise library from a bundled JSON file. The default seed is applied at every cold startup if the database is empty.
- **Clear**: deletes all data without re-seeding.

---

## 6. Timing Model

| Concept | What it measures | Authoritative? |
|---|---|---|
| Set timer (count-up) | Elapsed active time on the current **set** | Display only |
| Exercise timer (count-up) | Elapsed active time on the current **exercise** within the set | Display only |
| Rest countdown (count-down) | Remaining between-set rest time | Display only |
| `duration_hint_sec` | Expected duration of a single exercise slot | Hint; drives auto-advance and countdown cues |
| `WorkoutSessionSet.started_at / ended_at / paused_total_sec` | Set timing; actual active duration = `ended_at - started_at - paused_total_sec` | Authoritative history |
| `WorkoutSessionSet.rest_started_at / rest_duration_sec` | Between-set rest phase timing | Authoritative; cleared when rest ends |
| `WorkoutSessionExercise.started_at / ended_at / paused_offset_sec` | Wall-clock timestamps and pre-exercise pause offset | Authoritative history |
| `WorkoutSessionExercise.performed_duration_sec` | Actual exercise duration (computed on completion) | Authoritative history |
| `WorkoutSession.started_at / ended_at` | Wall-clock timestamps of the whole session | Authoritative history |

**Per-exercise elapsed time** is computed as: `now() - exercise.started_at - (set.paused_total_sec - exercise.paused_offset_sec) * 1000`. This correctly excludes any pauses that occurred before this exercise started.

**Rest phase** begins when advance crosses a set boundary and `rest_between_sets_sec > 0`. The rest countdown is client-side (`Date.now() - rest_started_at_ms`). When rest ends (via Start Set button or auto-start), `rest_started_at` is cleared and the next set's `started_at` is written.

**Sound cues** fire at predefined countdown boundaries (2 s, 1 s, 0 s, −1 s remaining) for both the exercise timer and the rest timer, when enabled.

Prev is defined as a corrective rewrite: all timestamps on affected exercise and set rows are reset to null and restarted from `now()`, and `paused_total_sec` is reset to 0. There is no interval-log tracking; `started_at` always represents the most recent time that row became active.

---

## 7. Navigation Model

```
MainMenu (/) — navigation hub:
  ├── ← Exercises    → Exercise Library
  ├── ← Sets         → Set Template Builder
  ├── ← Workouts     → Workout Template Builder / Saved Workouts
  ├── ← Runner       → Active Workout Runner (shows "Active" badge when a session is in progress)
  ├── ← History      → Workout History
  ├── ← Stats        → Stats
  └── ⚙ Settings    → Settings
```

There is no persistent tab bar or sidebar. All screens navigate back to MainMenu via a Back button. The runner is accessible from MainMenu or from the Workout Builder Start button.

Navigating away from Active Workout Runner does not pause the session. The session state remains unchanged in the database, and the runner restores correctly on return.

---

## 8. Platform Considerations

### Desktop (macOS)
- Full drag-and-drop for card and set reordering in all builders.
- Keyboard shortcuts for Next (→), Prev (←), Pause/Resume (Space) in Active Workout Runner.
- File save/open dialogs provide filesystem paths; file I/O uses standard Rust `std::fs`.
- Window can be resized; Active Workout Runner should remain usable at narrow widths.

### Android
- Builder reordering via explicit up/down arrow buttons only (no drag-and-drop in v1).
- Active Workout Runner must be legible on small screens; the set timer is the largest element.
- File save/open dialogs return `content://` URIs (Storage Access Framework). File I/O is handled by `FileIoPlugin.kt` (Kotlin), which uses `ContentResolver` to read/write via the URI. The same frontend code path works on both platforms.
- Session state is fully persisted in SQLite; timer accuracy survives process death and is recovered correctly on next launch via the session recovery flow.

---

## 9. Non-Goals (v1)

- Cloud sync or user accounts.
- Image upload or display for exercises.
- Vibration on exercise completion.
- Muscle-group balance charts or analytics dashboards (muscle metadata is stored and displayed on exercises; aggregate analytics are out of scope).
- Multiple concurrent users or devices.

---

## 10. Future-Proofing Notes

These are not v1 deliverables but the schema supports them:

- **Sync**: All PKs are UUIDs; `created_at` / `updated_at` on every row. A `sync_id` column can be added without breaking existing queries.
- **Muscle analytics**: Muscle data (`exercise_muscles` table) and exercise tags are already stored per-exercise. Future analytics screens can aggregate by muscle group or movement pattern.
- **Image support**: `image_url` field is present on `Exercise`; the UI field is shown but disabled.
- **Ad-hoc sessions**: `workout_template_id` is nullable on `WorkoutSession`; a future "quick start" flow can create sessions without a template.
- **Catalog tooling**: Two Node.js scripts (`scripts/generate-free-exercise-db-library.mjs`, `scripts/generate-yoga-poses-library.mjs`) convert external datasets into dzerkout library JSON for evaluation and manual import. Generated files are not committed or automatically seeded. The bundled default library (`src-tauri/seeds/default_library.json`) is produced by importing both generated catalogs into a fresh app, exporting the result, and replacing the seed file with that export — generated catalogs themselves are not the seed. Bundled defaults remain catalog-filterable because `catalog_source`, `catalog_id`, and `is_catalog` are preserved through export/import. See `scripts/README.md` for the full workflow.

---

## 11. Resolved Design Decisions

The following questions were open during initial design and have since been resolved by the implementation:

| # | Question | Resolution |
|---|---|---|
| 1 | When forking a set from the workout builder, does the new reference replace the original or insert after it? | The new forked set reference is inserted as the next item immediately after the original reference. The original reference remains and still points to the global set. |
| 2 | On Android, is long-press drag sufficient for reordering or do explicit arrow buttons need to ship in v1? | Up/down arrow buttons shipped in v1. Drag-and-drop is not available on Android. |
| 3 | What is the exact visual treatment for the per-card duration hint in the runner — countdown overlay, progress ring, or progress bar? | A dedicated EXERCISE TIME panel below the SET TIME panel shows elapsed and target time (e.g., "00:00:32 of 01:00"). No overlay or ring. |
