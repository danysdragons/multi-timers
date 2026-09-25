# First-iteration verification

Verified locally on September 25, 2026.

## Automated

`npm run check` passes: strict TypeScript checking, 20 Vitest tests, and the production Vite build. No production-build warnings remain.

Covered behavior:

- Multiple sessions accumulate without premature rounding or 24-hour display wrapping.
- Midnight allocation, the saved tracking zone, 23/25-hour days, ambiguous offsets, and invalid local times.
- Atomic switching, racing database connections, repeated starts, stale Stop requests, and reopening through a new database connection.
- Idempotent copying that preserves task IDs and existing destination status without copying time.
- Completion/reopening, archive/rename history, overlapping/future edits, and stale/deleted entries.
- Rollback after clock errors and simulated storage failures; retrying Stop retains the original requested timestamp.
- Snapshotting a running timer, stopped restore, rejection of malformed/orphaned/duplicate records, and validation of a 50,000-entry backup.

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

The production build uses `/multi-timers/` asset paths and bundled fonts. Safari/Firefox have not been separately exercised; timezone calculations and persistence use compatibility libraries, and the browser test above is Chromium-based.

## Deployment

The workflow is ready to check all pushed branches and publish successful `main` pushes automatically. Remote creation and live-site verification are pending an explicit repository visibility decision. Remaining deployment checks: create/configure repository and Pages, observe a successful deployment, verify the published site, then verify automatic deployment on a second push and record persistence across the update.
