# Multi Timers

A personal time tracker for the tasks you come back to. Start, stop, and resume throughout the day; see cumulative time at a glance. Built with React, TypeScript, and Vite, with a static GitHub Pages deployment.

## Use the app

- Add a task, then select **Start**. Starting another task stops the current timer automatically.
- Timers continue through refresh, sleep, and browser closure until explicitly stopped. On return, continue or correct the end time if you forgot to stop.
- Select a task name or its options button to inspect entries, add a duration manually, correct times, mark the day done, or edit the task.
- Favorite reusable tasks in **Task library**, then **Add favorites** on any day. Select daily tasks and **Copy selected to tomorrow** to choose a destination date. Only the task references are copied; totals and completion start fresh.
- Navigate previous dates to inspect and correct history. A session spanning midnight contributes to each day in the saved tracking time zone, including daylight-saving transitions.
- **Settings & backups** exports and restores your data. Restore validates the complete file and requires confirmation before replacing existing records. It never merges datasets.

## Where the data lives

Tasks, daily plans, and time entries live in this browser's IndexedDB database, `multi-timers-v1`. There is no backend, account, analytics, or automatic device sync. GitHub hosts the app's code, **not your personal time records**. Normal app updates at the same origin keep your records.

Use regular JSON backups. Browser data may be lost if you clear site storage, use private browsing, lose the device, or your browser evicts best-effort storage. Settings can request persistent storage to reduce eviction risk. Each browser profile and origin has separate data: local development, GitHub Pages, and another domain do not share records.

Exporting while timing saves a stopped snapshot through the export instant without stopping the live timer. Restoring always starts with no timer running. Export/import also provides a manual way to move to another device or origin. The app does not guarantee a full offline reload; a loaded tab can continue working without network access.

## Local development

Use Node.js 24 (see `.nvmrc`) and npm:

```sh
npm ci
npm run dev
```

Open the URL printed by Vite, normally `http://127.0.0.1:5173/multi-timers/`.

```sh
npm run typecheck
npm test
npm run build
npm run preview
npm run check
```

`check` runs type checking, the automated tests, and a production build. Tests exercise real IndexedDB operations through `fake-indexeddb`, including racing connections, transaction rollback, cumulative time, copy semantics, import validation, and time-zone boundaries. Browser verification also checks the actual UI, refresh recovery, mobile layout, and GitHub Pages assets.

## Deployment

Planned repository: `danysdragons/multi-timers`.
Planned app URL: `https://danysdragons.github.io/multi-timers/`.
Repository creation and live deployment are pending confirmation of repository visibility. See `VERIFICATION.md` for current verification status.

Every push runs checks. Successful pushes to `main` build and deploy automatically through `.github/workflows/pages.yml`. Other branches and pull requests run checks without changing the published site. A failed check leaves the previous deployment available. Deployment jobs are serialized and superseded commits are skipped. A manual run is available in GitHub Actions.

Repository settings: enable Actions; set **Pages → Source → GitHub Actions**; allow `main` to deploy to the `github-pages` environment. The workflow uses the built-in GitHub token with scoped Pages/OIDC permissions; no custom secret is required. `vite.config.ts` sets the `/multi-timers/` asset base. If the repository name or hosting path changes, update that base before publishing. Changing the origin also requires exporting/importing local data.

## Structure and scope

- `src/model.ts`: record types and complete backup validation.
- `src/time.ts`: pure timestamp, duration, and calendar-day calculations using the Temporal polyfill.
- `src/db.ts`: transactional persistence, timer switching, edits, and restore.
- `src/App.tsx` and `src/components/`: responsive interface and accessible native dialogs.
- `SPECIFICATION.md`: product requirements and acceptance criteria.
- `output/multi-model-imagegen/`: approved visual direction and generation prompts; these are not shipped in the app bundle.

Reports and graphs, automatic synchronization, PWA/offline installation, and full edit audit history are intentionally deferred. Cumulative totals and underlying entries remain available for future reporting. Timers depend on the device clock; detected backward jumps are rejected rather than silently corrupting durations.
