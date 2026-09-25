# Multi Timers — first-iteration specification

Status: approved for implementation, September 25, 2026. The user confirmed one active timer with automatic switching, single-device storage with backups, and React + TypeScript + Vite. See VERIFICATION.md for implementation and deployment status.

## 1. Purpose and scope

A personal web application for measuring cumulative time spent on recurring tasks. The main question it answers is: “How much time have I spent on this task today?” Exact start and stop times are recorded automatically and kept available for corrections and future reporting.

First-iteration success means a user can create Study X and Study Y, repeatedly start and stop them, see accurate accumulated totals, reuse those tasks tomorrow, and retain the underlying history after closing the browser or deploying a new app version.

The first iteration includes task management, timers, daily planning, history inspection, corrections, backup/restore, and automatic GitHub Pages deployment. Reports, charts, date-range analytics, billing, goals, countdowns, notifications, accounts, and automatic device synchronization are outside this proposed scope.

## 2. Proposed decisions

| Topic | Proposed behavior |
| --- | --- |
| Timer concurrency | One running timer across the app; starting another task stops the current task at the same instant. |
| Persistence | IndexedDB in the current browser, plus downloadable JSON backups and restore. |
| Daily reuse | Stable task library, favorites, and bulk copying selected tasks to another date. |
| Primary metric | Cumulative time for the selected day; lifetime task total in task details. |
| Hosting | Static application on GitHub Pages. |
| Publication | Every successful push to `main` deploys automatically; other branches run checks. |
| Repository | Proposed name `multi-timers`; owner and visibility to be resolved before repository creation. |

Confirmed product decisions: one active timer with automatic switching, and single-browser persistence with export/import backups. The deployment rule above interprets “every push” as every push to the publishing branch; publishing every branch to the same site would require a different rule.

## 3. Task identity and daily organization

A **task** is a reusable activity, such as Study X. A **day entry** places that task on a particular date. A **time entry** records a timed session or a manually entered duration.

The same task keeps the same ID across days. Copying Study X to tomorrow creates a new day entry, not a new task identity. This allows future reports to group all Study X sessions reliably, even if its name changes.

Task fields: required name (trimmed, 1–120 characters), optional description (up to 2,000 characters), favorite flag, and archive state. Creating an existing name offers to reuse that task; deliberately separate tasks with the same name remain possible after confirmation. IDs, never names, determine identity.

Day entries have an open or done status and a stable list position. “Done” applies only to that date. Starting a done task today reopens it. Completing a running task stops its timer and marks it done in one operation.

Renaming a task updates its display name across history while preserving identity. Time entries also retain the task name at creation for future exports. Archiving hides a task from normal add/copy choices but preserves all recorded time and historical visibility. An active task must be stopped before it can be archived.

Removing an empty day entry is allowed. An entry with recorded time cannot be removed through the planning action; the user can mark it done or explicitly correct/delete its time entries. There is no automatic deletion or daily reset of history.

Follow-up task deletion: task details and editing offer a permanent **Delete task…** action. Show the task name, lifetime duration, time-entry count, and planned-day count, and require an explicit confirmation checkbox. Delete the task, every daily placement, and all its time entries atomically. A running task must be stopped first, checked again inside the transaction. Offer archiving as the history-preserving alternative. Other tasks and their timers remain unchanged. Deletion has no undo except restoring a prior backup.

## 4. Main screen and interaction

The application opens on Today. Its layout, from top to bottom, is:

1. Date navigation: previous day, date picker, next day, and Today.
2. A prominent, sticky active-task panel, visible even while inspecting a different date.
3. The selected day's task list, with cumulative totals and task actions.
4. Actions to add a task, add favorites, and copy selected tasks to another day.

The active panel shows the task name, “Running” text, today's accumulated task time in large type, the current session duration, and a large Stop button. It explicitly labels these values as today/current session when the selected date is different. When idle, it displays “No timer running” with a clear route to start a task.

Each task row shows its name, selected-day total, status, and appropriate Start/Resume/Stop action. Details expose individual time entries, the lifetime total, editing, and completion controls. Start/Resume is available only for Today; historical dates support corrections and future dates support planning. The active panel's Stop control remains available on every screen.

Time uses `HH:MM:SS`, with hours allowed to exceed 23. Arithmetic retains milliseconds and rounds down only for display after summing. Never round every session before summing.

The layout works on desktop and phone screens down to 320 CSS pixels. All controls work with a keyboard, have visible focus, and use accessible names. Running/done states use text or icons as well as color. Screen readers receive start/stop announcements, without announcements every second. Touch targets are at least 44 × 44 CSS pixels.

Follow-up appearance options: provide Comfortable and Compact layouts, with a quick header toggle and a Settings control. Compact reduces heading, timer-panel, and task-row spacing and hides secondary row metadata while retaining names, totals, status, and actions. Details keep the full information. Offer Forest (default), Ocean, Plum, and Midnight (dark) themes in Settings. Save both preferences in IndexedDB, share them across tabs, and include them in backups. Older data and backups default to Forest and Comfortable without losing records.

## 5. Timer behavior

### Start, stop, resume, and switch

- Start persists a session with the current clock time before displaying a successful running state.
- Stop persists the end time; accumulated time remains visible.
- Resume starts another session belonging to the same task. It never overwrites prior sessions.
- Starting task B while task A runs closes A and opens B using one captured timestamp in one database transaction.
- Starting an already running task or repeating Stop is harmless. Rapid double-clicks cannot create duplicate sessions.
- The invariant is at most one open session across all tabs for this app's database.

Example: Study X runs 09:00–09:25 and 14:00–14:35. Its daily total is 01:00:00. Study Y's sessions accumulate independently.

### Refresh, sleep, and closure

Elapsed time is calculated from stored timestamps, not a counter incremented by browser callbacks. Refreshing, switching tabs, device sleep, and closing the browser do not stop a timer. On reopening, the app restores the running session and includes the elapsed gap.

When reopening with an active session, show its start time and offer Continue, Stop now, or Correct end time. The app does not guess when work ended or automatically discard long sessions. This behavior is explained on first use.

The display catches up immediately after suspension. No background process needs to run while the browser is closed. Detectable clock anomalies must never produce negative durations or silently corrupt stored time; show a correction path. Accurate unattended timing assumes the device clock remains correct—clock changes during closure cannot always be detected.

### Dates, midnight, and time zones

Store instants as UTC epoch milliseconds. Use one saved IANA tracking time zone, initially taken from the browser, for day boundaries. Display the chosen zone in settings. Once time records exist, changing the tracking zone is deferred beyond v1 so travel cannot silently regroup history.

A session crossing midnight stays one continuous session. Daily totals use the interval's overlap with each calendar day in the tracking zone. For example, 23:50–00:10 contributes ten minutes to each date. Days with session overlap show that task even if no explicit day entry was planned. Such implicit entries are open by default; changing their daily status creates a stored day entry.

Use actual calendar boundaries in the saved zone, including daylight-saving transitions; a day is not assumed to be 24 hours. The Today view advances at midnight, while a deliberately selected historical date stays selected. No running session is lost or reset.

## 6. Convenient daily reuse

The task library has favorites. “Add favorites” adds all nonarchived favorite tasks to the selected date in one action, skipping those already present. It does not create empty records automatically for every day when the app is unused.

“Copy selected tasks” lets the user select tasks from a day, choose a destination date (tomorrow by default), and copy them together. Copy task references and relative order only. New entries start open with zero recorded time; completion status, sessions, and time totals are never copied. Existing destination entries and their time/status remain unchanged. Repeating a copy cannot create duplicates.

Users can also add any existing library task individually. Creating a new task adds it to the currently selected date. An empty Today screen offers Add task, Add favorites, and Copy from yesterday.

## 7. History and corrections

Users can browse previous dates and expand a task to inspect its entries. This is a record list for verification and editing, not a reporting dashboard.

“Add time” accepts a task, date, positive duration in hours/minutes/seconds, and optional note. It creates a manual duration entry without inventing start/end timestamps. This supports “I studied for 30 minutes but forgot the timer.”

Timed sessions can have their start/end corrected; manual entries can have their duration/date corrected. A running session must be stopped normally or through Correct end time before other edits. Corrections recalculate every affected daily and lifetime total.

Reject invalid dates, negative or zero manually entered durations, end-before-start intervals, future completed time, and timed intervals that overlap another timed session. Adjacent intervals are allowed. Manual durations have no exact position within a day, so overlap cannot be verified; their totals are added as entered. Zero-duration timer sessions from an immediate stop may be omitted.

Correcting timestamps around a daylight-saving transition must disambiguate repeated local times using an offset and reject nonexistent local times. Deleting an entry requires confirmation showing its duration and date. Deleting or editing time is explicit; nothing expires automatically.

## 8. Persistence and recovery

GitHub Pages hosts static HTML, CSS, and JavaScript; it does not provide an application database server. [GitHub Pages documentation](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages)

**Recommendation: IndexedDB.** It stores structured records locally, supports indexes and transactions, and suits this workload without a server. SQLite remains a good future backend option if a service is introduced. Browser SQLite through WebAssembly is possible, but entails additional worker, filesystem, and concurrency choices without solving device synchronization. [IndexedDB documentation](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API), [SQLite browser persistence](https://sqlite.org/wasm/doc/tip/persistence.md)

Persistence requirements:

- Save every mutation immediately and atomically. Never rely on saving when a tab closes.
- Preserve data across normal browser restarts and app deployments at the same origin.
- Namespace the database for this application; version its schema and perform nondestructive migrations.
- Coordinate tab mutations through transactions and a shared active-session record; update other tabs promptly and refresh state on focus. Broadcast messages inform the UI but are not the correctness mechanism.
- Display a clear failure if storage is unavailable, full, or a write fails. Do not report success for unsaved actions. If Stop fails, retain the requested stop timestamp for retry while the page remains open and clearly mark it unsaved.
- Request persistent browser storage when supported and show whether it was granted. This reduces eviction risk, but users can still clear site data. [Browser storage durability](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria)

The first-use storage explanation states: data stays in this browser profile; another browser/device has a separate dataset; private browsing or clearing site data can remove it; GitHub contains application code, not a backup of personal records. Local development and the deployed site also have separate datasets.

### Backup and restore

Export downloads one versioned JSON file containing all tasks, day entries, time entries, settings, schema version, and export time. Show the last export date in settings and a nonblocking backup reminder after seven days with new changes.

Export is a consistent snapshot. If a timer runs, the backup includes that session closed at the snapshot timestamp, while the live timer continues unchanged. Explain that a restored backup contains time only through its export instant and restores no running timer.

Import validates the entire file, schema version, record references, IDs, durations, and interval constraints before changing data. Show a summary and require explicit confirmation that restore replaces the current dataset. Offer export first. The local timer must be stopped before restore; validate that again in the restore transaction. Restore is atomic; invalid or unsupported files leave existing data unchanged. Merge import and automatic cloud backups are deferred.

## 9. Logical data model

| Record | Main fields |
| --- | --- |
| Task | UUID, name, description, favorite, archivedAt, createdAt, updatedAt |
| Day entry | Unique taskId + localDate, status, sortOrder, createdAt, updatedAt |
| Timed entry | UUID, taskId, taskNameSnapshot, startedAt, endedAt (null while active), note, createdAt, updatedAt |
| Manual entry | UUID, taskId, taskNameSnapshot, localDate, durationMs, note, createdAt, updatedAt |
| App state | Singleton activeEntryId, trackingTimeZone, schemaVersion, lastExportAt, theme, density |

Time entries are the source of truth. Daily and lifetime totals are derived, including the current running interval. A future performance cache must be rebuildable and cannot replace raw records. Index by task, date, and session start/end as needed. All references must resolve. Archiving preserves historical tasks; only explicitly confirmed permanent task deletion cascades through their related records.

This structure supports future grouping by task/date and future migration to SQLite without building those reports now. Full revision history of edits is outside v1; updatedAt records the latest change.

## 10. Technical direction

Build a static single-page application with TypeScript and a lightweight frontend build tool. Proposed implementation: React and Vite, with a small IndexedDB adapter. Keep timer/date calculations and persistence operations separate from display components so they can be verified independently. Exact package versions are selected at implementation time.

Use a single entry URL with internal state or hash navigation so GitHub Pages does not need server-side route rewrites. Assets must work beneath the repository path `/multi-timers/`. No backend, runtime secrets, analytics, or remote task-data API is required for this proposal.

An already loaded app continues to record time if connectivity drops. Opening/reloading the app fully offline and installable PWA support are deferred; persistent records alone do not make the application shell available offline.

Target current stable Chrome, Edge, Firefox, and Safari, including mobile Safari and Chrome. Gracefully explain unsupported or unavailable storage instead of silently falling back to volatile memory. Aim for immediate feedback and responsive day browsing with at least 50,000 stored time entries.

## 11. GitHub repository and automatic deployment

Implementation deliverables include creating the GitHub repository, connecting this local repository as its `origin`, pushing the initial implementation, and configuring GitHub Pages to publish through GitHub Actions.

Proposed repository name: `multi-timers`. Determine the owner from the authenticated GitHub account and resolve visibility before creation. A public repository is the simplest GitHub Free option; private-repository Pages availability depends on the account plan. Repository visibility and whether the deployed site is publicly accessible are separate concerns. [GitHub Pages availability](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)

Local configuration includes a package manifest, lockfile, supported runtime declaration, scripts for development/checks/build, ignore rules, repository-relative asset base configuration, and a README explaining setup, data storage, backups, and deployment.

GitHub configuration includes Actions enabled, Pages source set to GitHub Actions, a `github-pages` environment allowed to deploy from `main`, and a workflow that installs from the lockfile, runs checks/tests, builds, uploads the static artifact, and deploys it. Use official Pages actions and the required scoped token permissions, including `pages: write` and `id-token: write` for deployment. [Custom Pages workflows](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)

Every push to `main` triggers validation and, on success, automatic deployment without manual intervention. Pull requests and other pushed branches run checks without replacing production. Serialize deployments so an older build cannot overwrite a newer published build. A failed check/build leaves the last successful site available. Include a manual rerun option for recovery.

Verify the actual published URL, nested-path assets, browser refresh, timer persistence, and a second push that updates the site automatically. Publishing a new build must not clear user records. Any future origin change requires a documented export/import migration.

## 12. Acceptance criteria

1. Create Study X and Study Y; both appear on Today with zero totals.
2. Time Study X for 25 minutes, stop, then time it for 35 minutes: total is one hour with two saved sessions.
3. Start Y while X runs: X stops and Y starts at the same instant, with one active timer.
4. The active task and Stop button remain prominent while navigating dates or scrolling.
5. Refresh/reopen with a timer active: its identity and elapsed time survive, including sleep/closure time.
6. Two tabs attempting Start concurrently cannot create two active sessions or overlapping recorded intervals.
7. Copy X and Y to tomorrow twice: one entry per task exists there, with zero time and open status; today's history is unchanged.
8. Reuse Study X on another day: lifetime time combines both days under one task ID.
9. Cross midnight and a daylight-saving boundary: per-day allocation is correct and sums to actual elapsed time.
10. Add 30 minutes manually without timestamps; edit/delete an entry and verify all affected totals update.
11. Archive/rename a task without losing its recorded history.
12. Export and restore a dataset, including an export made while running: totals at the snapshot match, no timer resumes, and malformed import changes nothing.
13. Simulate write failure: the app clearly reports unsaved work and never falsely claims persistence.
14. Deploy a new version: records in the same browser remain intact.
15. Push to `main`: checks pass and the live GitHub Pages site updates automatically.
16. Complete the primary task flow with keyboard only and on a narrow mobile viewport.
17. Delete a stopped task after confirmation: its time and daily records disappear together; other tasks remain intact. Running-task deletion is rejected and failed writes roll back completely.
18. Toggle Compact: more task rows fit on screen while the active timer stays prominent and controls remain usable on mobile.
19. Switch among all four themes and reload: preferences persist, with existing records and older backups still usable.

Verification will combine focused tests for arithmetic, date boundaries, state transitions, transactions, copying, and backup validation with browser checks for persistence, concurrent tabs, accessibility, and the deployed site. No reports or graph features are required for acceptance.

## 13. Delivery boundary

This document was the deliverable for the initial specification phase. Implementation was subsequently authorized with React + TypeScript + Vite. The two major product decisions in section 2 are confirmed. Publishing targets main. Repository visibility is resolved before remote creation; see VERIFICATION.md for the current delivery status.
