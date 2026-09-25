import { useState } from 'react'
import { Archive, Trash2 } from 'lucide-react'
import type { Entry, Task } from '../model'
import { duration, formatDuration } from '../time'
import { repository } from '../db'
import { Dialog } from './Dialog'
import type { Run } from './TaskForms'

export function DeleteTaskDialog({
  task,
  entries,
  dayCount,
  active,
  busy,
  run,
  onClose,
  onDeleted,
}: {
  task: Task
  entries: Entry[]
  dayCount: number
  active: boolean
  busy: boolean
  run: Run
  onClose: () => void
  onDeleted: () => void
}) {
  const [confirmed, setConfirmed] = useState(false)
  return (
    <Dialog title="Delete task?" busy={busy} onClose={onClose}>
      <div className="form-stack">
        <p>
          This permanently deletes <strong>{task.name}</strong> from your
          library and every day.
        </p>
        <div className="delete-summary">
          <strong className="mono">
            {formatDuration(
              entries.reduce(
                (sum, entry) => sum + duration(entry, Date.now()),
                0,
              ),
            )}
          </strong>
          <span>
            {entries.length} time {entries.length === 1 ? 'entry' : 'entries'} ·{' '}
            {dayCount} planned {dayCount === 1 ? 'day' : 'days'}
          </span>
        </div>
        <p className="muted small">
          Its recorded time will be deleted too. This cannot be undone without
          restoring a backup. To hide the task and keep its history, archive it
          instead.
        </p>
        {active ? (
          <p className="notice" role="status">
            Stop this task’s running timer before deleting it.
          </p>
        ) : (
          <label className="check-label">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
            />
            Delete this task and all its time history
          </label>
        )}
        <footer className="dialog-actions">
          {!task.archivedAt && (
            <button
              className="button"
              disabled={busy || active}
              onClick={async () => {
                if (
                  await run(
                    () =>
                      repository.updateTask(task.id, {
                        ...task,
                        archivedAt: Date.now(),
                      }),
                    'Task archived. History kept.',
                  )
                )
                  onDeleted()
              }}
            >
              <Archive size={17} />
              Archive instead
            </button>
          )}
          <button
            className="button danger"
            disabled={busy || active || !confirmed}
            onClick={async () => {
              if (
                await run(
                  () => repository.deleteTask(task.id),
                  'Task and its time history deleted.',
                )
              )
                onDeleted()
            }}
          >
            <Trash2 size={17} />
            Delete task
          </button>
        </footer>
      </div>
    </Dialog>
  )
}
