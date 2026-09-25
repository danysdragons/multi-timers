import { useState, type FormEvent } from 'react'
import type { Entry, Task } from '../model'
import { repository } from '../db'
import {
  editTimestamp,
  formatDuration,
  parseDuration,
  parseTimestamp,
} from '../time'
import { Dialog } from './Dialog'
import type { Run } from './TaskForms'

export function TimeEntryForm({
  task,
  entry,
  date,
  today,
  zone,
  busy,
  run,
  onClose,
}: {
  task: Task
  entry?: Entry
  date: string
  today: string
  zone: string
  busy: boolean
  run: Run
  onClose: () => void
}) {
  const timed = entry?.kind === 'timed' ? entry : undefined
  const active = timed?.endedAt === null
  const [entryDate, setEntryDate] = useState(
    entry?.kind === 'manual' ? entry.date : date,
  )
  const [amount, setAmount] = useState(
    entry?.kind === 'manual' ? formatDuration(entry.durationMs) : '00:30:00',
  )
  const [note, setNote] = useState(entry?.note ?? '')
  const [start, setStart] = useState(
    timed ? editTimestamp(timed.startedAt, zone) : '',
  )
  const [end, setEnd] = useState(
    timed ? editTimestamp(timed.endedAt ?? Date.now(), zone) : '',
  )
  async function submit(e: FormEvent) {
    e.preventDefault()
    const success = await run(
      async () => {
        const base = entry ?? {
          id: crypto.randomUUID(),
          taskId: task.id,
          taskNameSnapshot: task.name,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        }
        const updated: Entry = timed
          ? {
              ...timed,
              startedAt: active ? timed.startedAt : parseTimestamp(start, zone),
              endedAt: parseTimestamp(end, zone),
              note,
            }
          : {
              ...base,
              kind: 'manual',
              date: entryDate,
              durationMs: parseDuration(amount),
              note,
            }
        await repository.saveEntry(updated, active, !!entry)
      },
      active ? 'Timer stopped at the corrected time.' : 'Time saved.',
    )
    if (success) onClose()
  }
  return (
    <Dialog
      title={
        active ? 'Correct end time' : entry ? 'Edit time entry' : 'Add time'
      }
      busy={busy}
      onClose={onClose}
    >
      <form className="form-stack" onSubmit={submit}>
        <p className="form-task-name">{task.name}</p>
        {timed ? (
          <>
            <label>
              Started at
              <input
                value={start}
                disabled={active}
                onChange={(e) => setStart(e.target.value)}
                required
              />
            </label>
            <label>
              Ended at
              <input
                autoFocus
                value={end}
                onChange={(e) => setEnd(e.target.value)}
                required
              />
            </label>
            <p className="muted small">
              Time zone: {zone}. Keep the UTC offset (e.g. -04:00) so
              daylight-saving times are unambiguous.
            </p>
          </>
        ) : (
          <>
            <label>
              Date
              <input
                type="date"
                value={entryDate}
                max={today}
                onChange={(e) => setEntryDate(e.target.value)}
                required
              />
            </label>
            <label>
              Duration
              <input
                autoFocus
                className="mono"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="00:30:00"
                required
                pattern="[0-9]+:[0-5][0-9]:[0-5][0-9]"
                aria-describedby="duration-help"
              />
            </label>
            <p id="duration-help" className="muted small">
              Hours:minutes:seconds. No start or end time needed.
            </p>
          </>
        )}
        <label>
          Note <span className="optional">optional</span>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            maxLength={2000}
          />
        </label>
        <footer className="dialog-actions">
          <button
            type="button"
            className="button"
            disabled={busy}
            onClick={onClose}
          >
            Cancel
          </button>
          <button className="button primary" disabled={busy}>
            {active ? 'Save & stop timer' : 'Save time'}
          </button>
        </footer>
      </form>
    </Dialog>
  )
}
