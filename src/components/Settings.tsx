import { useEffect, useState } from 'react'
import {
  Download,
  HardDrive,
  ShieldCheck,
  Upload,
  Palette,
  Check,
} from 'lucide-react'
import { parseBackup, type Backup, type Data } from '../model'
import { repository } from '../db'
import { friendlyTime } from '../time'
import { Dialog } from './Dialog'
import type { Run } from './TaskForms'

export async function exportBackup() {
  const backup = await repository.snapshot()
  const blob = new Blob([JSON.stringify(backup, null, 2)], {
    type: 'application/json',
  })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `multi-timers-${new Date(backup.exportedAt).toISOString().replace(/[:.]/g, '-')}.json`
  document.body.append(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 30_000)
  await repository.markExported(backup.exportedAt)
}

export function SettingsDialog({
  data,
  busy,
  run,
  onClose,
  onRestore,
}: {
  data: Data
  busy: boolean
  run: Run
  onClose: () => void
  onRestore: () => void
}) {
  const [persistent, setPersistent] = useState<boolean | null>(null)
  const [backup, setBackup] = useState<{
    text: string
    parsed: Backup
    name: string
  } | null>(null)
  const [confirmed, setConfirmed] = useState(false)
  useEffect(() => {
    navigator.storage
      ?.persisted?.()
      .then(setPersistent)
      .catch(() => {})
  }, [])
  return (
    <Dialog title="Settings & backups" wide busy={busy} onClose={onClose}>
      <div className="form-stack settings">
        <section>
          <div className="section-label">
            <Palette size={19} />
            <h3>Appearance</h3>
          </div>
          <p>
            Make this workspace feel like yours. Your choices are saved on this
            device.
          </p>
          <fieldset className="appearance-fieldset">
            <legend>Theme</legend>
            <div className="theme-options">
              {(
                [
                  ['forest', 'Forest', 'Warm & familiar'],
                  ['ocean', 'Ocean', 'Cool & clear'],
                  ['plum', 'Plum', 'A softer palette'],
                  ['midnight', 'Midnight', 'Easy on the eyes'],
                ] as const
              ).map(([theme, label, description]) => (
                <label
                  key={theme}
                  className={`theme-option ${data.settings.theme === theme ? 'chosen' : ''}`}
                >
                  <input
                    type="radio"
                    name="theme"
                    value={theme}
                    checked={data.settings.theme === theme}
                    disabled={busy}
                    onChange={() =>
                      void run(() => repository.updateAppearance({ theme }))
                    }
                  />
                  <span
                    className={`theme-preview preview-${theme}`}
                    aria-hidden="true"
                  >
                    <span />
                    <span />
                    <span />
                  </span>
                  <span className="theme-name">
                    {label}
                    {data.settings.theme === theme && <Check size={15} />}
                  </span>
                  <span className="theme-description">{description}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset className="appearance-fieldset">
            <legend>Layout density</legend>
            <div className="density-options">
              {(['comfortable', 'compact'] as const).map((density) => (
                <label key={density} className="check-label">
                  <input
                    type="radio"
                    name="density"
                    checked={data.settings.density === density}
                    disabled={busy}
                    onChange={() =>
                      void run(() => repository.updateAppearance({ density }))
                    }
                  />
                  {density === 'compact' ? 'Compact' : 'Comfortable'}
                </label>
              ))}
            </div>
            <p className="muted small">
              Compact uses a smaller timer panel and tighter rows so more tasks
              fit on screen.
            </p>
          </fieldset>
        </section>
        <section>
          <div className="section-label">
            <HardDrive size={19} />
            <h3>Your data stays here</h3>
          </div>
          <p>
            Tasks and time are saved in this browser on this device. They are
            not synced to GitHub or other devices. Clearing site data or using
            private browsing can erase your history.
          </p>
          <div className="setting-row">
            <span>Tracking time zone</span>
            <strong>{data.settings.trackingTimeZone}</strong>
          </div>
          <p className="muted small">
            This stays fixed so travel does not change your historical daily
            totals.
          </p>
        </section>
        <section>
          <div className="section-label">
            <ShieldCheck size={19} />
            <h3>Browser storage</h3>
          </div>
          <p>
            {persistent === true
              ? 'Persistent storage is enabled. You can still remove data through browser settings.'
              : persistent === false
                ? 'Storage is best effort. Ask your browser to protect this data from automatic cleanup.'
                : 'Checking storage protection. If unavailable, keep regular backups.'}
          </p>
          <button
            className="button"
            disabled={
              busy || persistent === true || !navigator.storage?.persist
            }
            onClick={() => {
              void run(async () => {
                setPersistent(await navigator.storage.persist())
              })
            }}
          >
            {persistent ? 'Storage protected' : 'Request persistent storage'}
          </button>
        </section>
        <section>
          <h3>Keep a backup</h3>
          <p>
            Download all tasks and time entries as a JSON file. A running timer
            is saved through the export instant; it continues here and restores
            as stopped.
          </p>
          <button
            className="button primary"
            disabled={busy}
            onClick={() =>
              void run(
                exportBackup,
                'Backup download started. Keep the file somewhere safe.',
              )
            }
          >
            <Download size={17} />
            Export backup
          </button>
          <p className="muted small">
            {data.settings.lastExportAt
              ? `Last export: ${friendlyTime(data.settings.lastExportAt, data.settings.trackingTimeZone)}`
              : 'No backup exported yet.'}
          </p>
        </section>
        <section>
          <h3>Restore a backup</h3>
          <p>
            Restore replaces all data in this browser. Export your current data
            first if you want to keep it.
          </p>
          <label className="file-picker">
            <Upload size={18} />
            <span>Choose backup file</span>
            <input
              type="file"
              accept=".json,application/json"
              disabled={busy}
              aria-label="Choose backup file"
              onChange={(e) => {
                const file = e.target.files?.[0]
                setBackup(null)
                setConfirmed(false)
                if (file)
                  void run(async () => {
                    if (file.size > 100 * 1024 * 1024)
                      throw new Error(
                        'This file is too large. Choose a Multi Timers JSON backup smaller than 100 MB.',
                      )
                    const text = await file.text()
                    const parsed = parseBackup(text)
                    setBackup({ text, parsed, name: file.name })
                  })
                e.target.value = ''
              }}
            />
          </label>
          {backup && (
            <div className="notice restore-preview">
              <strong>{backup.name}</strong>
              <p>
                {backup.parsed.data.tasks.length} tasks ·{' '}
                {backup.parsed.data.entries.length} time entries
              </p>
              <p className="small">
                Exported{' '}
                {friendlyTime(
                  backup.parsed.exportedAt,
                  backup.parsed.data.settings.trackingTimeZone,
                )}
              </p>
              <label className="check-label">
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(e) => setConfirmed(e.target.checked)}
                />
                Replace my current data with this backup
              </label>
              <button
                className="button danger"
                disabled={busy || !confirmed || !!data.settings.activeEntryId}
                onClick={async () => {
                  if (
                    await run(
                      () => repository.restore(backup.text),
                      'Backup restored. All timers are stopped.',
                    )
                  ) {
                    onRestore()
                    onClose()
                  }
                }}
              >
                Replace data & restore
              </button>
              {data.settings.activeEntryId && (
                <p>Stop the running timer before restoring.</p>
              )}
            </div>
          )}
        </section>
      </div>
    </Dialog>
  )
}
