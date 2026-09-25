# First-iteration verification

Verified locally and on GitHub Pages on September 25, 2026.

## Automated

`npm run check` passes: strict TypeScript checking, 26 Vitest tests, and the production Vite build. No production-build warnings remain.

Covered behavior:

- Multiple sessions accumulate without premature rounding or 24-hour display wrapping.
- Midnight allocation, the saved tracking zone, 23/25-hour days, ambiguous offsets, and invalid local times.
- Atomic switching, racing database connections, repeated starts, stale Stop requests, and reopening through a new database connection.
- Idempotent copying that preserves task IDs and existing destination status without copying time.
- Completion/reopening, archive/rename history, overlapping/future edits, and stale/deleted entries.
- Rollback after clock errors and simulated storage failures; retrying Stop retains the original requested timestamp.
- Snapshotting a running timer, stopped restore, rejection of malformed/orphaned/duplicate records, and validation of a 50,000-entry backup.
- Task deletion removes its entries and daily placements atomically while preserving another task's active timer. Stale-tab deletion of a running task is rejected; simulated deletion failure rolls back all records.
- Theme and density preferences persist across connections and concurrent updates. Existing databases and older backups acquire defaults without losing data; new backups preserve appearance choices.

## Browser checks

Checked through the Codex in-app browser using disposable local data:

- Empty state and first-use storage explanation.
- Task creation, favorites, Enter-key form submission, and dialog focus.
- Start Study X, switch to Study Y, stop, resume, and refresh while running.
- Recovered active timer and accumulated elapsed time after reload.
- Add one hour manually and confirm the daily/lifetime totals increase accordingly.
- Copy two tasks to tomorrow and verify both start with zero time.
- Two tabs: switching in one updates the other; stopping in the other clears the running state in both.
- Desktop at 1440px, mobile at 390px, and no horizontal overflow at 320px.
- Export action updates the last-export indicator; invalid import displays an error; valid import previews counts and restores a 30-minute manual entry with no running timer.
- No browser errors/warnings after the final reload.
- Appearance follow-up: switched Ocean, Plum, and Midnight themes; confirmed saved Midnight/Compact preferences after reload. Desktop task rows shrink from 89px to 56px and the idle timer panel from 176px to about 104px.
- Deletion confirmation shows the correct history summary, requires the checkbox, and blocks a running task. Cancel returns to its details without changing history. Cascade deletion itself is covered by database integration tests.
- Compact layout and appearance/deletion dialogs fit a 320px viewport without horizontal overflow; inspected Midnight and Ocean on mobile.

The production build uses `/multi-timers/` asset paths and bundled fonts. Safari/Firefox have not been separately exercised; timezone calculations and persistence use compatibility libraries, and the browser test above is Chromium-based.

## Deployment

The public repository is [danysdragons/multi-timers](https://github.com/danysdragons/multi-timers). GitHub Pages publishes the [live app](https://danysdragons.github.io/multi-timers/) over HTTPS using GitHub Actions. The `github-pages` environment permits deployment from `main` only.

The [initial automatic run](https://github.com/danysdragons/multi-timers/actions/runs/36157357656) passed both the check and deploy jobs. The published app loaded successfully in the browser with its fonts, styles, and task controls, without browser errors or warnings. A new browser origin starts with an empty task list; local-development data is separate.

Every push triggers checks. Successful `main` pushes deploy automatically; feature branches and pull requests do not publish. The workflow serializes deployments and skips superseded builds. Publishing replaces static assets; the app keeps browser records in the same versioned IndexedDB database.
